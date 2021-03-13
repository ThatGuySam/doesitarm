//Global Constants
var LOAD_COMMAND_TYPES = [];

/*
	@Class LoadCommand

	@Description
*/
let LOAD_COMMAND_TYPE = {
    LC_UNKNOWN: 0,
    LC_SEGMENT: 1,
    LC_SYMTAB: 2, //Symbol table
    LC_SYMSEG: 3, //Segment
    LC_THREAD: 4,
    LC_UNIXTHREAD: 5,
    LC_LOADFVMLIB: 6,	/* load a specified fixed VM shared library */
    LC_IDFVMLIB: 7,	/* fixed VM shared library identification */
    LC_IDENT: 8,	/* object identification info (obsolete) */
    LC_FVMFILE: 9,	/* fixed VM file inclusion (internal use) */
    LC_PREPAGE: 10,    /* prepage command (internal use) */
    LC_DYSYMTAB: 11,	/* dynamic link-edit symbol table info */
    LC_LOAD_DYLIB: 12,	/* load a dynamicly linked shared library */
    LC_ID_DYLIB: 13,	/* dynamicly linked shared lib identification */
    LC_LOAD_DYLINKER: 14,	/* load a dynamic linker */
    LC_ID_DYLINKER: 15,
    LC_PREBOUND_DYLIB: 16,	/* modules prebound for a dynamicly */
    LC_ROUTINES: 17,
    LC_SUB_FRAMEWORK: 18,
    LC_SUB_UMBRELLA: 19,
    LC_SUB_CLIENT: 20,
    LC_SUB_LIBRARY: 21,
    LC_TWOLEVEL_HINTS: 22,
    LC_PREBIND_CKSUM: 23,
    LC_SEGMENT_64: 25,
    LC_ROUTINES_64: 26,
    LC_UUID: 27,
    LC_CODE_SIGNATURE: 29,
    LC_SEGMENT_SPLIT_INFO: 30,
    LC_LAZY_LOAD_DYLIB: 32,
    LC_ENCRYPTION_INFO: 33,
    LC_DYLD_INFO: 34,
    LC_VERSION_MIN_MACOSX: 36,
    LC_VERSION_MIN_IPHONEOS: 37,
    LC_FUNCTION_STARTS: 38,
    LC_DYLD_ENVIRONMENT: 39,
    LC_DATA_IN_CODE: 41,
    LC_SOURCE_VERSION: 42,
    LC_DYLIB_CODE_SIGN_DRS: 43,
    LC_ENCRYPTION_INFO_64: 44,
    LC_LINKER_OPTION: 45,
    LC_LINKER_OPTIMIZATION_HINT: 46,
    LC_VERSION_MIN_TVOS: 47,
    LC_VERSION_MIN_WATCHOS: 48,
    LC_NOTE: 49,
    LC_BUILD_VERSION: 50,
    LC_LOAD_WEAK_DYLIB: 2147483672,
    LC_RPATH: 2147483676,
    LC_REEXPORT_DYLIB: 2147483679,
    LC_DYLD_INFO_ONLY: 2147483682,
    LC_LOAD_UPWARD_DYLIB: 2147483683,
    LC_MAIN: 2147483688,

    DESCRIPTION: function(search) {
        let result = LOAD_COMMAND_TYPES[search];
        return (result != undefined) ? result : search;
    },

    toString: function() {
        return JSON.stringify(this);
    }
};

LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_SEGMENT] = '32-bits Segment command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_SYMTAB] = 'Symbol table command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_SYMSEG] = 'Symbol segment command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_THREAD] = 'Thread command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_UNIXTHREAD] = 'UNIX Thread command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_LOADFVMLIB] = 'Fixed Virtual Memory Library Load command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_IDFVMLIB] = 'Fixed Virtual Memory Library identification information command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_IDENT] = 'Object identification information command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_FVMFILE] = 'Fixed VM File inclusion commmand';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_PREPAGE] = 'Prepage command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_DYSYMTAB] = 'Dynamic Link-Edit Symbol Table information command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_LOAD_DYLIB] = 'Dynamically linked shared library identification command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_ID_DYLIB] = 'Dynamic Library Identifier';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_LOAD_DYLINKER] = 'Dynamic Linker Load Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_ID_DYLINKER] = 'Dynamic Linker Identifier';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_PREBOUND_DYLIB] = 'Prebound Dynamic Library Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_ROUTINES] = 'Routines Load Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_SUB_FRAMEWORK] = 'Sub Framework Load Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_SUB_UMBRELLA] = 'Sub Umbrella Load Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_SUB_CLIENT] = 'Sub Client Load Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_SUB_LIBRARY] = 'Sub Library Load Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_TWOLEVEL_HINTS] = 'TwoLevel Hints Load Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_PREBIND_CKSUM] = 'Prebind Checksum Load Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_SEGMENT_64] = '64-bits Segment Load Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_ROUTINES_64] = '64-bits Routines Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_UUID] = 'UUID Load Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_CODE_SIGNATURE] = 'Code Signature';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_SEGMENT_SPLIT_INFO] = 'Segment Split Information Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_LAZY_LOAD_DYLIB] = 'Lazy Dynamic Library Load Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_ENCRYPTION_INFO] = '32-bits encryption Information';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_DYLD_INFO] = 'Dynamic Loader Information Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_VERSION_MIN_MACOSX] = 'Minimum Version Requirement Command for OSX';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_VERSION_MIN_IPHONEOS] = 'Minimum Version Requirement Command for iPhone';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_FUNCTION_STARTS] = 'Function Starts Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_DYLD_ENVIRONMENT] = 'Dynamic Loader Environment Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_DATA_IN_CODE] = 'Data In Code Load Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_SOURCE_VERSION] = 'Source Version Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_DYLIB_CODE_SIGN_DRS] = 'Dynamic Library Code Sign Directories Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_ENCRYPTION_INFO_64] = '64-bits Encryption Information';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_LINKER_OPTION] = 'Linker Option Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_LINKER_OPTIMIZATION_HINT] = 'Linker Optimization Hint';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_VERSION_MIN_TVOS] = 'Minimum Version Requirement Command for tvOS';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_VERSION_MIN_WATCHOS] = 'Minimum Version Requirement Command for watchOS';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_NOTE] = 'Additional Note';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_BUILD_VERSION] = 'Build Version';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_LOAD_WEAK_DYLIB] = 'Weak Dynamic Library Load Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_RPATH] = 'Executable Path';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_REEXPORT_DYLIB] = 'Re-Exported Dynamic Library Load Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_DYLD_INFO_ONLY] = 'Dynamic Library Loader Information Only';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_LOAD_UPWARD_DYLIB] = 'Upward Dynamic Library Load Command';
LOAD_COMMAND_TYPES[LOAD_COMMAND_TYPE.LC_MAIN] = 'Main Entrypoint';

var LoadCommand = function LoadCommand(type, data, size, fileoff) {
    this.cmd = type || 0;
    this.cmdsize = size || 0;
    this.data = data || new Uint8Array();
    this.fileoff = fileoff || 0;
};


export { LOAD_COMMAND_TYPE, LOAD_COMMAND_TYPES, LoadCommand }
