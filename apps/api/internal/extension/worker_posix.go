//go:build unix

package extension

import (
	"os/exec"
	"syscall"
)

// setProcessGroup puts the worker in its own process group so cancel can
// kill the whole tree (the go-run fallback spawns children).
func setProcessGroup(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

// killWorkerGroup returns the cancel hook that SIGKILLs the whole process
// group, falling back to the context's own error as the command's result.
func killWorkerGroup(cmd *exec.Cmd, ctxErr func() error) func() error {
	return func() error {
		if cmd.Process != nil {
			_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		}
		return ctxErr()
	}
}
