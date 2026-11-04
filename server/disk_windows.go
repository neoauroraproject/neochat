//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

var procGetDiskFreeSpaceEx = syscall.NewLazyDLL("kernel32.dll").NewProc("GetDiskFreeSpaceExW")

// diskUsage reports the size and the space available to us on the volume holding path.
func diskUsage(path string) (total, free uint64, err error) {
	p, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return 0, 0, err
	}
	var avail, size, totalFree uint64
	r, _, e := procGetDiskFreeSpaceEx.Call(uintptr(unsafe.Pointer(p)),
		uintptr(unsafe.Pointer(&avail)), uintptr(unsafe.Pointer(&size)), uintptr(unsafe.Pointer(&totalFree)))
	if r == 0 {
		return 0, 0, e
	}
	return size, avail, nil
}
