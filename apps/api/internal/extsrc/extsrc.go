// Package extsrc runs the structural analysis IDEAVEN applies to authored
// extension source (the "compile" pipeline step). It deliberately never
// executes untrusted code: the checks are lexical and structural — language
// detection, delimiter balance with string/char/comment awareness, and, for
// Java-like sources, the presence of a package declaration and a type
// declaration. The same analysis runs in the isolated build worker and in
// the AI fix validator, so a proposed fix is judged by exactly the rules
// that will compile it.
package extsrc

import (
	"regexp"
	"strings"
	"unicode/utf8"
)

// Problem is one structural finding at a source line (1-based; 0 when not
// tied to a line).
type Problem struct {
	Line    int    `json:"line"`
	Message string `json:"message"`
}

var classPattern = regexp.MustCompile(`\b(class|interface|enum|record|object)\s+[A-Za-z_]`)
var packagePattern = regexp.MustCompile(`(?m)^\s*package\s+[A-Za-z_][\w.]*\s*;`)
var javaModifierPattern = regexp.MustCompile(
	`\b(public|private|protected)\s+(static\s+)?(final\s+)?(void|class|int|long|boolean|double|float|String\b)`)
var javaAnnotationPattern = regexp.MustCompile(`@(Override|SimpleFunction|SimpleProperty|SimpleEvent)`)

// LooksLikeJava reports whether the source reads like Java/Kotlin (the
// App-Inventor-style extension languages): it starts with typical headers
// or contains class-level Java declarations.
func LooksLikeJava(source string) bool {
	head := source
	if len(head) > 4000 {
		head = head[:4000]
	}
	if regexp.MustCompile(`(?m)^\s*(package\s|import\s)`).MatchString(head) {
		return true
	}
	return classPattern.MatchString(head) ||
		javaModifierPattern.MatchString(head) ||
		javaAnnotationPattern.MatchString(head)
}

// FileNameFor picks the packaged file name for authored source: .java for
// Java-like content, .txt for anything else (the Studio allows any
// text-based language).
func FileNameFor(source string) string {
	if LooksLikeJava(source) {
		return "main.java"
	}
	return "source.txt"
}

// Analyze runs the structural compile. Empty or whitespace-only source has
// nothing to analyze and reports no problems — "nothing to compile" is a
// valid state, not an error.
func Analyze(source string) []Problem {
	if strings.TrimSpace(source) == "" {
		return nil
	}
	var problems []Problem
	if !utf8.ValidString(source) {
		return append(problems, Problem{Line: 1, Message: "source is not valid UTF-8 text"})
	}
	problems = append(problems, balanceProblems(source)...)
	if LooksLikeJava(source) {
		if !packagePattern.MatchString(source) {
			problems = append(problems, Problem{
				Line:    1,
				Message: `Java-like source must declare a package (e.g. "package com.example.myextension;")`,
			})
		}
		if !classPattern.MatchString(source) {
			problems = append(problems, Problem{
				Line:    1,
				Message: `Java-like source must declare at least one type (class, interface, enum, or record)`,
			})
		}
	}
	return problems
}

// balanceProblems scans the source tracking strings, chars, and comments,
// then reports mismatched or unclosed (), [], {} with the opening line.
func balanceProblems(source string) []Problem {
	type open struct {
		rune byte
		line int
	}
	var stack []open
	line := 1
	var problems []Problem

	var i int
	next := func() byte {
		b := source[i]
		i++
		return b
	}
	peek := func() byte {
		if i < len(source) {
			return source[i]
		}
		return 0
	}

	for i < len(source) {
		c := next()
		switch c {
		case '\n':
			line++
		case '/':
			if peek() == '/' { // line comment
				for i < len(source) && source[i] != '\n' {
					i++
				}
				continue
			}
			if peek() == '*' { // block comment
				i++ // consume '*'
				closed := false
				for i < len(source) {
					b := next()
					if b == '\n' {
						line++
					} else if b == '*' && peek() == '/' {
						i++
						closed = true
						break
					}
				}
				if !closed {
					problems = append(problems, Problem{Line: line, Message: "unterminated /* comment"})
				}
				continue
			}
		case '"': // string literal (handles \" escapes)
			closed := false
			for i < len(source) {
				b := next()
				if b == '\\' {
					if i < len(source) {
						i++
					}
					continue
				}
				if b == '"' {
					closed = true
					break
				}
				if b == '\n' {
					problems = append(problems, Problem{Line: line, Message: `unclosed string literal — strings cannot span lines`})
					line++
					break
				}
			}
			_ = closed
		case '\'': // char literal
			for i < len(source) {
				b := next()
				if b == '\\' {
					if i < len(source) {
						i++
					}
					continue
				}
				if b == '\'' || b == '\n' {
					break
				}
			}
		case '(', '[', '{':
			stack = append(stack, open{rune: c, line: line})
		case ')', ']', '}':
			want := map[byte]byte{')': '(', ']': '[', '}': '{'}[c]
			if len(stack) == 0 {
				problems = append(problems, Problem{
					Line:    line,
					Message: "unexpected closing " + string(c) + " with nothing open",
				})
				continue
			}
			top := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			if top.rune != want {
				problems = append(problems, Problem{
					Line:    top.line,
					Message: "unclosed " + string(top.rune) + " opened here — closed by " + string(c) + " instead",
				})
			}
		}
	}
	for _, o := range stack {
		problems = append(problems, Problem{
			Line:    o.line,
			Message: "unclosed " + string(o.rune) + " — expected a matching " + closingFor(o.rune),
		})
	}
	return problems
}

func closingFor(open byte) string {
	switch open {
	case '(':
		return ")"
	case '[':
		return "]"
	default:
		return "}"
	}
}
