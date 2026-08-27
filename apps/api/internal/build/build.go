// Package build carries version information for the API service.
package build

// Version is the semantic version of the API. It can be overridden at link
// time with:
//
//	go build -ldflags "-X ideaven/apps/api/internal/build.Version=1.2.3"
var Version = "0.1.0"
