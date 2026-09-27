//go:build windows

package extension

import (
	"os/exec"
)

// On Windows the worker cannot be given a killable process group the same
// way, so it runs without one. Cancellation relies on WaitDelay: after the
// cancel hook returns, the runtime closes the pipes and terminates the
// worker with os.Process.Kill once WaitDelay elapses.
func setProcessGroup(cmd *exec.Cmd) {}

// killWorkerGroup lets the context's own error surface as the command's
// result; WaitDelay performs the actual termination.
func killWorkerGroup(cmd *exec.Cmd, ctxErr func() error) func() error {
	return func() error { return ctxErr() }
}
