var FILE_TYPES = [];
var FILE_FLAGS = [];


/*
	@Class FILE_TYPE

	@Description
	File Type is the class for identifying what MACH-O file is being dealed with.
*/
let FILE_TYPE = {
    MH_OBJECT: 0x1,		/* relocatable object file */
    MH_EXECUTE: 0x2,		/* demand paged executable file */
    MH_FVMLIB: 0x3,	/* fixed VM shared library file */
    MH_CORE: 0x4, /* core file */
    MH_PRELOAD: 0x5, /* preloaded executable file */
    MH_DYLIB: 0x6, /* dynamicly bound shared library file*/
    MH_DYLINKER: 0x7, /* dynamic link editor */
    MH_BUNDLE: 0x8, /* dynamicly bound bundle file */
    MH_DYLIB_STUB: 0x9,
    MH_DSYM: 0xa,
    MH_KEXT_BUNDLE: 0xb,

    DESCRIPTION: function(search) {
        let result = FILE_TYPES[search];
        return (result != undefined) ? result : search;
    },

    toString: function() {
        return JSON.stringify(this);
    },

    debugdescription: ""
};

FILE_TYPES[FILE_TYPE.MH_OBJECT] = 'Relocatable Object File';
FILE_TYPES[FILE_TYPE.MH_EXECUTE] = 'Demand Paged Executable File';
FILE_TYPES[FILE_TYPE.MH_FVMLIB] = 'Fixed Virtual Memory Shared Library File';
FILE_TYPES[FILE_TYPE.MH_CORE] = 'Core File';
FILE_TYPES[FILE_TYPE.MH_PRELOAD] = 'Preloaded Executable File';
FILE_TYPES[FILE_TYPE.MH_DYLIB] = 'Dynamically Bound Shared Library File';
FILE_TYPES[FILE_TYPE.MH_DYLINKER] = 'Dynamic Link Editor';
FILE_TYPES[FILE_TYPE.MH_BUNDLE] = 'Dynamically Bound Bundle File';
FILE_TYPES[FILE_TYPE.MH_DYLIB_STUB] = 'Dynamic Library Predefined Symbol';
FILE_TYPES[FILE_TYPE.MH_DSYM] = 'Dynamic Symbol';
FILE_TYPES[FILE_TYPE.MH_KEXT_BUNDLE] = 'Kernel Extension Bundle';

let FILE_FLAG = {
    MH_NOUNDEFS: 0x1,	/* the object file has no undefined references, can be executed */
    MH_INCRLINK: 0x2, /* the object file is the output of an incremental link against a base file and can't be link edited again */
    MH_DYLDLINK: 0x4, /* the object file is input for the dynamic linker and can't be staticly link edited again */
    MH_BINDATLOAD: 0x8, /* the object file's undefined references are bound by the dynamic linker when loaded. */
    MH_PREBOUND: 0x10, /* the file has it's dynamic undefined references prebound. */

    DESCRIPTION: function(search) {

        let result = FILE_FLAGS[search];
        return (result != undefined) ? result : search;
    },

    toString: function() {
        return JSON.stringify(this);
    }
};

FILE_FLAGS[FILE_FLAG.MH_NOUNDEFS] = 'The object file has no undefined references and is executable.';
FILE_FLAGS[FILE_FLAG.MH_INCRLINK] = 'The object file is the output of an incremental link against a base file and can not be link edited again.';
FILE_FLAGS[FILE_FLAG.MH_DYLDLINK] = 'The object file is the input for the dynamic linker and can not be staticly link edited again.';
FILE_FLAGS[FILE_FLAG.MH_BINDATLOAD] = 'The object file\'s undefined references are bound by the dynamic linker when loaded.';
FILE_FLAGS[FILE_FLAG.MH_PREBOUND] = 'The file has it\'s dynamic undefined references prebound.';


export { FILE_TYPES, FILE_FLAGS, FILE_TYPE, FILE_FLAG }
