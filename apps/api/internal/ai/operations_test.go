package ai

import (
	"strings"
	"testing"
)

// Pure validation tests: parseAndValidateOperations never touches the
// database, so these run everywhere (the handler tests skip without one).

func run(t *testing.T, output string) (*commandResponse, error) {
	t.Helper()
	return parseAndValidateOperations(output)
}

func TestParseAcceptsDeleteHandler(t *testing.T) {
	out := `{"explanation":"Removes the broken handler.","operations":[` +
		`{"op":"deleteHandler","screenId":"s1","handlerId":"h1"}]}`
	parsed, err := run(t, out)
	if err != nil {
		t.Fatalf("valid deleteHandler rejected: %v", err)
	}
	if len(parsed.Operations) != 1 || parsed.Operations[0].HandlerID != "h1" {
		t.Fatalf("operation not carried through: %+v", parsed.Operations)
	}
}

func TestParseAcceptsUpdateBlockInputScalars(t *testing.T) {
	for _, value := range []string{
		`"s2"`,      // navigate retarget
		`42`,        // number literal
		`true`,      // boolean literal
		`"counter"`, // variable name
	} {
		out := `{"explanation":"Retargets the block.","operations":[` +
			`{"op":"updateBlockInput","screenId":"s1","handlerId":"h1","blockId":"b1","input":"screenId","value":` + value + `}]}`
		if _, err := run(t, out); err != nil {
			t.Fatalf("valid updateBlockInput value %s rejected: %v", value, err)
		}
	}
}

func TestParseRejectsUpdateBlockInputMissingFields(t *testing.T) {
	for name, out := range map[string]string{
		"missing handlerId": `{"op":"updateBlockInput","screenId":"s1","blockId":"b1","input":"screenId","value":"s2"}`,
		"missing blockId":   `{"op":"updateBlockInput","screenId":"s1","handlerId":"h1","input":"screenId","value":"s2"}`,
		"missing input":     `{"op":"updateBlockInput","screenId":"s1","handlerId":"h1","blockId":"b1","value":"s2"}`,
		"blank input":       `{"op":"updateBlockInput","screenId":"s1","handlerId":"h1","blockId":"b1","input":"  ","value":"s2"}`,
	} {
		if _, err := run(t, `{"explanation":"x","operations":[`+out+`]}`); err == nil {
			t.Fatalf("%s: must be rejected", name)
		}
	}
}

func TestParseRejectsUpdateBlockInputNonScalarValue(t *testing.T) {
	out := `{"explanation":"x","operations":[` +
		`{"op":"updateBlockInput","screenId":"s1","handlerId":"h1","blockId":"b1","input":"screenId","value":{"id":"s2"}}]}`
	_, err := run(t, out)
	if err == nil || !strings.Contains(err.Error(), "string, number or boolean") {
		t.Fatalf("object value must be rejected, got %v", err)
	}
}

func TestParseRejectsDeleteHandlerMissingHandlerID(t *testing.T) {
	out := `{"explanation":"x","operations":[{"op":"deleteHandler","screenId":"s1"}]}`
	_, err := run(t, out)
	if err == nil {
		t.Fatal("deleteHandler without handlerId accepted")
	}
}
