//Global Constants
var CPU_TYPES = [];
var CPUSubTypeARM = [];

let CPU_ARCH_CONST = {
    MASK: 0x01000000,
    ABI64: 0xff000000,
    toString: function() {
        JSON.stringify(this);
    }
};

let CPU_TYPE = {
    ANY: -1,
    VAX: 1,
    MC680: 6,
    X86: 7,
    MIPS: 8,
    MC98000: 10,
    HPPA: 11,
    ARM: 12,
    ARM64: 16777228,
    MC88000: 13,
    SPARC: 14,
    I860: 15,
    POWERPC: 18,
    POWERPC64: 16777234,
    DESCRIPTION: function(search) {
        let result = CPU_TYPES[search];
        return (result != undefined) ? result : search;
    },
    toString: function() {
        return JSON.stringify(this);
    }
};

CPU_TYPES[CPU_TYPE.ANY] = "Any";
CPU_TYPES[CPU_TYPE.VAX] = "VAX";
CPU_TYPES[CPU_TYPE.MC680] = "MC680";
CPU_TYPE[CPU_TYPE.HPPA] = "HPPA";
CPU_TYPES[CPU_TYPE.ARM] = "ARM";
CPU_TYPES[CPU_TYPE.ARM64] = "ARM64";
CPU_TYPES[CPU_TYPE.X86] = "X86";
CPU_TYPES[CPU_TYPE.I860] = "I860";
CPU_TYPES[CPU_TYPE.MIPS] = "Mips";
CPU_TYPES[CPU_TYPE.MC98000] = "MC98000";
CPU_TYPES[CPU_TYPE.SPARC] = "Sparc";
CPU_TYPES[CPU_TYPE.POWERPC] = "Power PC";
CPU_TYPES[CPU_TYPE.POWERPC64] = "Power PC 64-bit";

let CPU_SUB_TYPE = {
    ARM: {
        MULTIPLE: -1,
        ALL: 0,
        ARM_A500_ARCH: 1,
        ARM_A500: 2,
        ARM_A440: 3,
        ARM_M4: 4,
        V4T: 5,
        V6: 6,
        V5TEJ: 7,
        XSCALE: 8,
        V7: 9,
        V7F: 10,
        V7S: 11,
        V7K: 12,
        V8: 13,
        V6M: 14,
        V7M: 15,
        V7EM: 16,
        DESCRIPTION: function(search) {


            let result = CPUSubTypeARM[search];
            return (result != undefined) ? result : search;
        },
        toString: function() {
            return JSON.stringify(this);
        }
    },
    ARM64: {
        MULTIPLE: -1,
        ALL: 0,
        V8: 1,
        DESCRIPTION: function(search) {
            var CPUSubTypeARM64 = [];
            CPUSubTypeARM64[CPU_SUB_TYPE.ARM64.ALL] = 'all';
            let result = CPUSubTypeARM64[search];
            return (result != undefined) ? result : search;
        },
        toString: function() {
            return JSON.stringify(this);
        }
    },
    POWERPC64: {
        MULTIPLE: -1,
        POWERPC_ALL: 0,
        POWERPC_601: 1,
        POWERPC_602: 2,
        POWERPC_603: 3,
        POWERPC_603e: 4,
        POWERPC_603ev: 5,
        POWERPC_604: 6,
        POWERPC_604e: 7,
        POWERPC_620: 8,
        POWERPC_750: 9,
        POWERPC_7400: 10,
        POWERPC_7450: 11,
        POWERPC_970: 100,
        POWERPC_ALL_LIB64: 2147483648,
        toString: function() {
            return JSON.stringify(this);
        }
    },
    toString: function() {
        return JSON.stringify(this);
    }
};

CPUSubTypeARM[CPU_SUB_TYPE.ARM.ALL] = 'all';
CPUSubTypeARM[CPU_SUB_TYPE.ARM.V4T] = 'v4t';
CPUSubTypeARM[CPU_SUB_TYPE.ARM.V6] = 'v6';
CPUSubTypeARM[CPU_SUB_TYPE.ARM.V5] = 'v5';
CPUSubTypeARM[CPU_SUB_TYPE.ARM.XSCALE] = 'xscale';
CPUSubTypeARM[CPU_SUB_TYPE.ARM.V7] = 'v7';
CPUSubTypeARM[CPU_SUB_TYPE.ARM.V7F] = 'v7f';
CPUSubTypeARM[CPU_SUB_TYPE.ARM.V7S] = 'v7s';
CPUSubTypeARM[CPU_SUB_TYPE.ARM.V7K] = 'v7k';
CPUSubTypeARM[CPU_SUB_TYPE.ARM.V6M] = 'v6m';
CPUSubTypeARM[CPU_SUB_TYPE.ARM.V7M] = 'v7m';
CPUSubTypeARM[CPU_SUB_TYPE.ARM.V7EM] = 'v7em';


export { CPU_TYPES, CPUSubTypeARM, CPU_ARCH_CONST, CPU_TYPE, CPU_SUB_TYPE }
