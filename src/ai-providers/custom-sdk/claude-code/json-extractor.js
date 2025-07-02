/**
 * @fileoverview Extract JSON from Claude's response, handling markdown blocks and other formatting
 */

/**
 * Extract JSON from Claude's response
 * @param {string} text - The text to extract JSON from
 * @returns {string} - The extracted JSON string
 */
export function extractJson(text) {
	// Remove markdown code blocks if present
	let jsonText = text.trim();

	// Remove ```json blocks
	jsonText = jsonText.replace(/^```json\s*/gm, '');
	jsonText = jsonText.replace(/^```\s*/gm, '');
	jsonText = jsonText.replace(/```\s*$/gm, '');

	// Remove common TypeScript/JavaScript patterns
	jsonText = jsonText.replace(/^const\s+\w+\s*=\s*/, ''); // Remove "const varName = "
	jsonText = jsonText.replace(/^let\s+\w+\s*=\s*/, ''); // Remove "let varName = "
	jsonText = jsonText.replace(/^var\s+\w+\s*=\s*/, ''); // Remove "var varName = "
	jsonText = jsonText.replace(/;?\s*$/, ''); // Remove trailing semicolons

	// Try to extract JSON object or array
	const objectMatch = jsonText.match(/{[\s\S]*}/);
	const arrayMatch = jsonText.match(/\[[\s\S]*\]/);

	if (objectMatch) {
		jsonText = objectMatch[0];
	} else if (arrayMatch) {
		jsonText = arrayMatch[0];
	}

	// First try to parse as valid JSON
	try {
		JSON.parse(jsonText);
		return jsonText;
	} catch {
		// If it's not valid JSON, try to fix common issues
		try {
			// Handle incomplete JSON (e.g., "dependencies": } or "dependencies":)
			let fixedJson = jsonText;

			// Fix incomplete dependencies field specifically (should be an array)
			fixedJson = fixedJson.replace(/"dependencies"\s*:\s*$/, '"dependencies": []');
			fixedJson = fixedJson.replace(/"dependencies"\s*:\s*}/, '"dependencies": []}');
			fixedJson = fixedJson.replace(/"dependencies"\s*:\s*,/, '"dependencies": [],');
			
			// Fix other array fields that might be incomplete
			fixedJson = fixedJson.replace(/"subtasks"\s*:\s*$/, '"subtasks": []');
			fixedJson = fixedJson.replace(/"subtasks"\s*:\s*}/, '"subtasks": []}');
			fixedJson = fixedJson.replace(/"subtasks"\s*:\s*,/, '"subtasks": [],');

			// Fix other common incomplete patterns for string fields
			fixedJson = fixedJson.replace(/"(title|description|details|testStrategy)"\s*:\s*$/, '"$1": ""');
			fixedJson = fixedJson.replace(/"(title|description|details|testStrategy)"\s*:\s*}/, '"$1": ""}');
			fixedJson = fixedJson.replace(/"(title|description|details|testStrategy)"\s*:\s*,/, '"$1": "",');
			
			// Fix any remaining hanging colons (fallback for unknown fields)
			fixedJson = fixedJson.replace(/:\s*$/, ': ""'); // Fix hanging colons at end
			fixedJson = fixedJson.replace(/:\s*}/, ': ""}'); // Fix hanging colons before closing
			fixedJson = fixedJson.replace(/:\s*,/, ': "",'); // Fix hanging colons before comma

			// Fix trailing commas and ensure proper closing
			fixedJson = fixedJson.replace(/,(\s*[}\]])/, '$1'); // Remove trailing commas
			
			// Ensure the JSON is properly closed
			if (fixedJson.startsWith('{') && !fixedJson.endsWith('}')) {
				fixedJson += '}';
			}
			if (fixedJson.startsWith('[') && !fixedJson.endsWith(']')) {
				fixedJson += ']';
			}

			// Try to parse the fixed JSON
			JSON.parse(fixedJson);
			return fixedJson;
		} catch {
			// If fixing didn't work, try to convert from JavaScript object literal
			try {
				// This is a simple conversion that handles basic cases
				// Replace unquoted keys with quoted keys
				const converted = jsonText
					.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
					// Replace single quotes with double quotes
					.replace(/'/g, '"');

				// Validate the converted JSON
				JSON.parse(converted);
				return converted;
			} catch {
				// If all else fails, return the original text
				// The AI SDK will handle the error appropriately
				return text;
			}
		}
	}
}

/**
 * Validates if a JSON string represents a complete object structure
 * @param {string} jsonText - The JSON text to validate
 * @returns {boolean} - True if the JSON appears complete, false otherwise
 */
export function isCompleteJson(jsonText) {
	try {
		const parsed = JSON.parse(jsonText);
		
		// Check if it's an object and has some basic structure
		if (typeof parsed !== 'object' || parsed === null) {
			return false;
		}
		
		// For task objects, ensure required fields are present and not incomplete
		if (parsed.title !== undefined || parsed.description !== undefined) {
			// This looks like a task object, check for incomplete fields
			const hasIncompleteFields = Object.values(parsed).some(value => 
				value === undefined || value === null || 
				(typeof value === 'string' && value.trim() === '')
			);
			return !hasIncompleteFields;
		}
		
		return true;
	} catch {
		return false;
	}
}

/**
 * Attempts to complete an incomplete task JSON object with sensible defaults
 * @param {string} incompleteJson - The incomplete JSON string
 * @returns {string} - A complete JSON string with defaults filled in
 */
export function completeTaskJson(incompleteJson) {
	try {
		let parsed = JSON.parse(incompleteJson);
		
		// Ensure it's an object
		if (typeof parsed !== 'object' || parsed === null) {
			parsed = {};
		}
		
		// Fill in missing required fields with defaults
		const defaults = {
			title: parsed.title || "Generated Task",
			description: parsed.description || "Task generated from incomplete AI response",
			details: parsed.details || "Please review and update task details",
			testStrategy: parsed.testStrategy || "Manual verification required",
			dependencies: Array.isArray(parsed.dependencies) ? parsed.dependencies : []
		};
		
		// Merge with original, preferring original values where they exist and are valid
		const completed = { ...defaults, ...parsed };
		
		// Ensure dependencies is always an array
		if (!Array.isArray(completed.dependencies)) {
			completed.dependencies = [];
		}
		
		return JSON.stringify(completed, null, 2);
	} catch {
		// If parsing completely fails, return a minimal valid task JSON
		return JSON.stringify({
			title: "Error Recovery Task",
			description: "Task created due to JSON parsing error",
			details: "Original AI response could not be parsed. Please review and update.",
			testStrategy: "Manual verification required",
			dependencies: []
		}, null, 2);
	}
}
