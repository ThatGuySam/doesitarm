// Adapted from https://github.com/indutny/macho/blob/master/lib/macho/constants.js

export const constants = {}

constants.cpuArch = {
    mask: 0xff000000,
    abi64: 0x01000000,
    abi32: 0x02000000
};

constants.cpuType = {
    0x01: 'vax',
    0x06: 'mc680x0',
    0x07: 'i386',
    0x01000007: 'x86_64',
    0x0a: 'mc98000',
    0x0b: 'hppa',
    0x0c: 'arm',
    0x0100000c: 'arm64',
    0x0200000c: 'arm64_32',
    0x0d: 'mc88000',
    0x0e: 'sparc',
    0x0f: 'i860',
    0x10: 'alpha',
    0x12: 'powerpc',
    0x01000012: 'powerpc64'
};

constants.endian = {
    0xffffffff: 'multiple',
    0: 'le',
    1: 'be'
};

constants.cpuSubType = {
    mask: 0x00ffffff,
    vax: {
        0: 'all',
        1: '780',
        2: '785',
        3: '750',
        4: '730',
        5: 'I',
        6: 'II',
        7: '8200',
        8: '8500',
        9: '8600',
        10: '8650',
        11: '8800',
        12: 'III'
    },
    mc680x0: {
        1: 'all',
        2: '40',
        3: '30_only'
    },
    i386: {},
    x86_64: {
        3: 'all',
        4: 'arch1'
    },
    mips: {
        0: 'all',
        1: 'r2300',
        2: 'r2600',
        3: 'r2800',
        4: 'r2000a',
        5: 'r2000',
        6: 'r3000a',
        7: 'r3000'
    },
    mc98000: {
        0: 'all',
        1: 'mc98601'
    },
    hppa: {
        0: 'all',
        1: '7100lc'
    },
    mc88000: {
        0: 'all',
        1: 'mc88100',
        2: 'mc88110'
    },
    sparc: {
        0: 'all'
    },
    i860: {
        0: 'all',
        1: '860'
    },
    powerpc: {
        0: 'all',
        1: '601',
        2: '602',
        3: '603',
        4: '603e',
        5: '603ev',
        6: '604',
        7: '604e',
        8: '620',
        9: '750',
        10: '7400',
        11: '7450',
        100: '970'
    },
    arm: {
        0: 'all',
        5: 'v4t',
        6: 'v6',
        7: 'v5tej',
        8: 'xscale',
        9: 'v7',
        10: 'v7f',
        11: 'v7s',
        12: 'v7k',
        14: 'v6m',
        15: 'v7m',
        16: 'v7em'
    },
    arm64: {
        0: 'all',
        1: 'v8',
        2: 'e'
    },
    arm64_32: {
        1: 'all'
    }
};

function cpuSubtypeIntel(a, b, name) {
    constants.cpuSubType.i386[a + (b << 4)] = name;
}

[
    [3, 0, 'all'],
    [4, 0, '486'],
    [4, 8, '486sx'],
    [5, 0, '586'],
    [6, 1, 'pentpro'],
    [6, 3, 'pentII_m3'],
    [6, 5, 'pentII_m5'],
    [7, 6, 'celeron'],
    [7, 7, 'celeron_mobile'],
    [8, 0, 'pentium_3'],
    [8, 1, 'pentium_3_m'],
    [8, 2, 'pentium_3_xeon'],
    [9, 0, 'pentium_m'],
    [10, 0, 'pentium_4'],
    [10, 1, 'pentium_4_m'],
    [11, 0, 'itanium'],
    [11, 1, 'itanium_2'],
    [12, 0, 'xeon'],
    [12, 1, 'xeon_mp']
].forEach(function(item) {
    cpuSubtypeIntel(item[0], item[1], item[2]);
});

constants.fileType = {
    1: 'object',
    2: 'execute',
    3: 'fvmlib',
    4: 'core',
    5: 'preload',
    6: 'dylib',
    7: 'dylinker',
    8: 'bundle',
    9: 'dylib_stub',
    10: 'dsym',
    11: 'kext'
};

constants.flags = {
    0x1: 'noundefs',
    0x2: 'incrlink',
    0x4: 'dyldlink',
    0x8: 'bindatload',
    0x10: 'prebound',
    0x20: 'split_segs',
    0x40: 'lazy_init',
    0x80: 'twolevel',
    0x100: 'force_flat',
    0x200: 'nomultidefs',
    0x400: 'nofixprebinding',
    0x800: 'prebindable',
    0x1000: 'allmodsbound',
    0x2000: 'subsections_via_symbols',
    0x4000: 'canonical',
    0x8000: 'weak_defines',
    0x10000: 'binds_to_weak',
    0x20000: 'allow_stack_execution',
    0x40000: 'root_safe',
    0x80000: 'setuid_safe',
    0x100000: 'reexported_dylibs',
    0x200000: 'pie',
    0x400000: 'dead_strippable_dylib',
    0x800000: 'has_tlv_descriptors',
    0x1000000: 'no_heap_execution'
};

constants.cmdType = {
    0x80000000: 'req_dyld',
    0x1: 'segment',
    0x2: 'symtab',
    0x3: 'symseg',
    0x4: 'thread',
    0x5: 'unixthread',
    0x6: 'loadfvmlib',
    0x7: 'idfvmlib',
    0x8: 'ident',
    0x9: 'fmvfile',
    0xa: 'prepage',
    0xb: 'dysymtab',
    0xc: 'load_dylib',
    0xd: 'id_dylib',
    0xe: 'load_dylinker',
    0xf: 'id_dylinker',
    0x10: 'prebound_dylib',
    0x11: 'routines',
    0x12: 'sub_framework',
    0x13: 'sub_umbrella',
    0x14: 'sub_client',
    0x15: 'sub_library',
    0x16: 'twolevel_hints',
    0x17: 'prebind_cksum',

    0x80000018: 'load_weak_dylib',
    0x19: 'segment_64',
    0x1a: 'routines_64',
    0x1b: 'uuid',
    0x8000001c: 'rpath',
    0x1d: 'code_signature',
    0x1e: 'segment_split_info',
    0x8000001f: 'reexport_dylib',
    0x20: 'lazy_load_dylib',
    0x21: 'encryption_info',
    0x80000022: 'dyld_info',
    0x80000023: 'dyld_info_only',
    0x24: 'version_min_macosx',
    0x25: 'version_min_iphoneos',
    0x26: 'function_starts',
    0x27: 'dyld_environment',
    0x80000028: 'main',
    0x29: 'data_in_code',
    0x2a: 'source_version',
    0x2b: 'dylib_code_sign_drs',
    0x2c: 'encryption_info_64',
    0x2d: 'linker_option'
};

constants.prot = {
    none: 0,
    read: 1,
    write: 2,
    execute: 4
};

constants.segFlag = {
    1: 'highvm',
    2: 'fvmlib',
    4: 'noreloc',
    8: 'protected_version_1'
};

constants.segTypeMask = 0xff;
constants.segType = {
    0: 'regular',
    1: 'zerofill',
    2: 'cstring_literals',
    3: '4byte_literals',
    4: '8byte_literals',
    5: 'literal_pointers',
    6: 'non_lazy_symbol_pointers',
    7: 'lazy_symbol_pointers',
    8: 'symbol_stubs',
    9: 'mod_init_func_pointers',
    0xa: 'mod_term_func_pointers',
    0xb: 'coalesced',
    0xc: 'gb_zerofill',
    0xd: 'interposing',
    0xe: '16byte_literals',
    0xf: 'dtrace_dof',
    0x10: 'lazy_dylib_symbol_pointers',
    0x11: 'thread_local_regular',
    0x12: 'thread_local_zerofill',
    0x13: 'thread_local_variables',
    0x14: 'thread_local_variable_pointers',
    0x15: 'thread_local_init_function_pointers'
};

constants.segAttrUsrMask = 0xff000000;
constants.segAttrUsr = {
    '-2147483648': 'pure_instructions',
    0x40000000: 'no_toc',
    0x20000000: 'strip_static_syms',
    0x10000000: 'no_dead_strip',
    0x08000000: 'live_support',
    0x04000000: 'self_modifying_code',
    0x02000000: 'debug'
};

constants.segAttrSysMask = 0x00ffff00;
constants.segAttrSys = {
    0x400: 'some_instructions',
    0x200: 'ext_reloc',
    0x100: 'loc_reloc'
};

