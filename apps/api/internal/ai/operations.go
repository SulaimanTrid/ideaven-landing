package ai

import (
	"encoding/json"
	"fmt"
	"strings"

	"ideaven/apps/api/internal/httpx"
)

// parseAndValidateOperations extracts the JSON changeset from the provider
// output (tolerating markdown fences) and validates every operation against
// the closed vocabulary. Unknown ops or malformed fields reject the whole
// response — the client must never receive a half-valid changeset.
func parseAndValidateOperations(output string) (*commandResponse, error) {
	trimmed := strings.TrimSpace(output)
	// Strip markdown fences if the provider added them despite instructions.
	if strings.HasPrefix(trimmed, "```") {
		trimmed = strings.TrimPrefix(trimmed, "```json")
		trimmed = strings.TrimPrefix(trimmed, "```")
		trimmed = strings.TrimSuffix(trimmed, "```")
		trimmed = strings.TrimSpace(trimmed)
		// Some models wrap JSON in fences with prose around it; find the object.
		if !strings.HasPrefix(trimmed, "{") {
			if start := strings.Index(trimmed, "{"); start >= 0 {
				if end := strings.LastIndex(trimmed, "}"); end > start {
					trimmed = trimmed[start : end+1]
				}
			}
		}
	}

	var parsed commandResponse
	if err := json.Unmarshal([]byte(trimmed), &parsed); err != nil {
		return nil, fmt.Errorf("ai: output is not the expected JSON: %w", err)
	}

	for i := range parsed.Operations {
		if err := validateOperation(&parsed.Operations[i]); err != nil {
			return nil, err
		}
	}
	if parsed.Explanation == "" {
		parsed.Explanation = "Proposed changes for your project."
	}
	return &parsed, nil
}

func validateOperation(op *Operation) error {
	switch op.Op {
	case "createScreen":
		if strings.TrimSpace(op.Name) == "" {
			return invalid("createScreen requires a name.")
		}
	case "setStartScreen":
		if strings.TrimSpace(op.ScreenID) == "" {
			return invalid("setStartScreen requires screenId.")
		}
	case "createComponent":
		if strings.TrimSpace(op.ScreenID) == "" {
			return invalid("createComponent requires screenId.")
		}
		if strings.TrimSpace(op.ComponentType) == "" {
			return invalid("createComponent requires componentType.")
		}
	case "updateComponent", "deleteComponent":
		if strings.TrimSpace(op.ComponentID) == "" {
			return invalid(op.Op + " requires componentId.")
		}
	case "createVariable":
		if strings.TrimSpace(op.VariableName) == "" {
			return invalid("createVariable requires variableName.")
		}
	case "deleteVariable":
		if strings.TrimSpace(op.VariableName) == "" {
			return invalid("deleteVariable requires variableName.")
		}
	case "setScreenCode":
		if strings.TrimSpace(op.ScreenID) == "" || strings.TrimSpace(op.Code) == "" {
			return invalid("setScreenCode requires screenId and code.")
		}
	case "deleteHandler":
		if strings.TrimSpace(op.ScreenID) == "" || strings.TrimSpace(op.HandlerID) == "" {
			return invalid("deleteHandler requires screenId and handlerId.")
		}
	case "updateBlockInput":
		if strings.TrimSpace(op.ScreenID) == "" || strings.TrimSpace(op.HandlerID) == "" || strings.TrimSpace(op.BlockID) == "" {
			return invalid("updateBlockInput requires screenId, handlerId and blockId.")
		}
		if strings.TrimSpace(op.Input) == "" {
			return invalid("updateBlockInput requires the input key to change.")
		}
		switch op.Value.(type) {
		case string, float64, bool:
			// Scalars only — block inputs are literals and ID references.
		default:
			return invalid("updateBlockInput value must be a string, number or boolean.")
		}
	default:
		return invalid(fmt.Sprintf("Unknown operation %q.", op.Op))
	}
	return nil
}

func invalid(message string) *httpx.Error {
	return httpx.Errorf(502, "AI_PROVIDER_ERROR", "The AI proposed an invalid change ("+message+") — nothing was applied. Try rephrasing.")
}
