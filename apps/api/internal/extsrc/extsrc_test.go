package extsrc

import (
	"strings"
	"testing"
)

func TestAnalyzeEmptySource(t *testing.T) {
	if problems := Analyze("   \n\t "); problems != nil {
		t.Fatalf("blank source must analyze clean, got %v", problems)
	}
}

func TestAnalyzeValidJava(t *testing.T) {
	source := `package com.example.myextension;

import android.content.Context;

public class MyExtension {
  private final Context context;

  public MyExtension(Context context) {
    this.context = context; // trailing comment { with } delimiters in it
  }

  @Override
  public String toString() { return "MyExtension{}"; }
}
`
	if problems := Analyze(source); problems != nil {
		t.Fatalf("valid Java must analyze clean, got %v", problems)
	}
	if !LooksLikeJava(source) {
		t.Fatal("LooksLikeJava must detect the Java skeleton")
	}
	if name := FileNameFor(source); name != "main.java" {
		t.Fatalf("file name = %q, want main.java", name)
	}
}

func TestAnalyzeUnclosedBrace(t *testing.T) {
	source := `package com.example.myextension;

public class MyExtension {
  public void run() {
    if (true) {
      doWork();
`
	problems := Analyze(source)
	if len(problems) == 0 {
		t.Fatal("unbalanced source must produce problems")
	}
	joined := ""
	for _, p := range problems {
		joined += p.Message + "\n"
	}
	if !strings.Contains(joined, "unclosed") {
		t.Fatalf("expected unclosed-delimiter problem, got: %s", joined)
	}
	if problems[0].Line < 3 || problems[0].Line > 5 {
		t.Fatalf("problem should point at the opening line (3-5), got %d", problems[0].Line)
	}
}

func TestAnalyzeMismatchedDelimiters(t *testing.T) {
	source := "package p;\nclass A {\n\tvoid x() {\n\t}\n]" // ']' closes '{'
	problems := Analyze(source)
	if len(problems) == 0 {
		t.Fatal("mismatched delimiters must be reported")
	}
}

func TestAnalyzeCommentsAndStringsIgnored(t *testing.T) {
	source := `package p;
// class Fake { (((
/* block ( comment [ with { stray delimiters }} */
class Real {
  String s = "not { a ( bracket [";
  char c = '}';
}
`
	if problems := Analyze(source); problems != nil {
		t.Fatalf("delimiters inside comments/strings must be ignored, got %v", problems)
	}
}

func TestAnalyzeMissingPackageAndType(t *testing.T) {
	source := "public void whatever() { System.out.println(\"no package, no class\"); }"
	problems := Analyze(source)
	joined := ""
	for _, p := range problems {
		joined += p.Message + "\n"
	}
	if !strings.Contains(joined, "package") && !strings.Contains(joined, "type") {
		t.Fatalf("expected package/type guidance, got: %s", joined)
	}
}

func TestAnalyzeUnclosedString(t *testing.T) {
	source := "package p;\nclass A {\n  String s = \"starts but never ends\n}\n"
	problems := Analyze(source)
	if len(problems) == 0 {
		t.Fatal("unclosed string must be reported")
	}
}

func TestAnalyzeNonJavaTextPasses(t *testing.T) {
	source := "# a python-ish sketch\ndef run():\n    print('hi')\n"
	if problems := Analyze(source); problems != nil {
		t.Fatalf("non-Java text only needs balanced delimiters, got %v", problems)
	}
	if LooksLikeJava(source) {
		t.Fatal("python-ish source must not look like Java")
	}
	if name := FileNameFor(source); name != "source.txt" {
		t.Fatalf("file name = %q, want source.txt", name)
	}
}
