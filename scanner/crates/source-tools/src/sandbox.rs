//! Extra Linux restrictions for an offline patch process. Landlock in setpriv
//! separately confines file reads and writes. This filter has no network exceptions.

use std::io::{self, Write};

#[cfg(target_arch = "x86_64")]
pub fn print_filter() -> io::Result<()> {
    const LOAD_WORD: u16 = 0x20;
    const EQUAL: u16 = 0x15;
    const BIT_SET: u16 = 0x45;
    const RETURN: u16 = 0x06;
    const ALLOW: u32 = 0x7fff_0000;
    const ERRNO: u32 = 0x0005_0000;
    const KILL_PROCESS: u32 = 0x8000_0000;
    const AUDIT_X86_64: u32 = 0xc000_003e;
    const X32_SYSCALL_BIT: u32 = 0x4000_0000;
    let mut out = io::stdout().lock();
    let mut instruction = |opcode: u16, yes: u8, no: u8, operand: u32| {
        out.write_all(&opcode.to_ne_bytes())?;
        out.write_all(&[yes, no])?;
        out.write_all(&operand.to_ne_bytes())
    };
    instruction(LOAD_WORD, 0, 0, 4)?; // seccomp_data.arch
    instruction(EQUAL, 1, 0, AUDIT_X86_64)?;
    instruction(RETURN, 0, 0, KILL_PROCESS)?;
    instruction(LOAD_WORD, 0, 0, 0)?; // seccomp_data.nr
    instruction(BIT_SET, 0, 1, X32_SYSCALL_BIT)?;
    instruction(RETURN, 0, 0, KILL_PROCESS)?;

    let forbidden = [
        libc::SYS_socket,
        libc::SYS_socketpair,
        libc::SYS_connect,
        libc::SYS_sendto,
        libc::SYS_sendmsg,
        libc::SYS_sendmmsg,
        libc::SYS_io_uring_setup,
        libc::SYS_io_uring_enter,
        libc::SYS_io_uring_register,
        libc::SYS_bpf,
        libc::SYS_open_by_handle_at,
        libc::SYS_ptrace,
        libc::SYS_process_vm_readv,
        libc::SYS_process_vm_writev,
        libc::SYS_pidfd_open,
        libc::SYS_pidfd_getfd,
        libc::SYS_pidfd_send_signal,
        libc::SYS_kill,
        libc::SYS_tkill,
        libc::SYS_tgkill,
        libc::SYS_rt_sigqueueinfo,
        libc::SYS_rt_tgsigqueueinfo,
        libc::SYS_setsid,
        libc::SYS_setpgid,
        libc::SYS_setns,
        libc::SYS_unshare,
        libc::SYS_mount,
        libc::SYS_umount2,
        libc::SYS_move_mount,
        libc::SYS_mount_setattr,
        libc::SYS_pivot_root,
        libc::SYS_fsopen,
        libc::SYS_fsconfig,
        libc::SYS_fsmount,
        libc::SYS_fspick,
        libc::SYS_keyctl,
        libc::SYS_add_key,
        libc::SYS_request_key,
        libc::SYS_chmod,
        libc::SYS_fchmod,
        libc::SYS_fchmodat,
        libc::SYS_fchmodat2,
        libc::SYS_chown,
        libc::SYS_fchown,
        libc::SYS_lchown,
        libc::SYS_fchownat,
        libc::SYS_utime,
        libc::SYS_utimes,
        libc::SYS_futimesat,
        libc::SYS_utimensat,
        libc::SYS_setxattr,
        libc::SYS_lsetxattr,
        libc::SYS_fsetxattr,
        libc::SYS_removexattr,
        libc::SYS_lremovexattr,
        libc::SYS_fremovexattr,
    ];
    for syscall in forbidden {
        instruction(EQUAL, 0, 1, syscall as u32)?;
        instruction(RETURN, 0, 0, ERRNO | libc::EPERM as u32)?;
    }
    instruction(RETURN, 0, 0, ALLOW)?;
    out.flush()
}

#[cfg(not(target_arch = "x86_64"))]
pub fn print_filter() -> io::Result<()> {
    Err(io::Error::other(
        "the offline healing filter requires x86_64 Linux",
    ))
}
