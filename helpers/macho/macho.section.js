//Global Constants

let SECTION_MASK = {
	SECTION_TYPE: 0x000000ff,
	SECTION_ATTRIBUTES: 0xffffff00
	toString = function() {
		return JSON.stringify(this);
	}
};

let SECTION_TYPE = {
	REGULAR: 0,
	ZEROFILL: 1,
	CSTRING_LITERALS: 2,
	BYTE4_LITERALS: 3,
	BYTE8_LITERALS: 4,
	LITERAL_POINTERS: 5,
	NON_LAZY_SYMBOL_POINTERS: 6,
	LAZY_SYMBOL_POINTERS: 7,
	SYMBOL_STUBS: 8,
	MOD_INIT_FUNC_POINTERS: 9,
	MOD_TERM_FUNC_POINTERS: 0xa,
	COALESCED: 0xb,
	GB_ZEROFILL: 0xc,
	INTERPOSING: 0xd,
	BYTE16_LITERALS: 0xe,
	DTRACE_DOF: 0xf,
	LAZY_DYLIB_SYMBOL_POINTERS: 0x10,
	THREAD_LOCAL_REGULAR: 0x11,
	THREAD_LOCAL_ZEROFILL: 0x12,
	THREAD_LOCAL_VARIABLES: 0x13,
	THREAD_LOCAL_VARIABLE_POINTERS: 0x14,
	THREAD_LOCAL_INIT_FUNCTION_POINTERS: 0x15,
	toString: function() {
		return JSON.stringify(this);
	}
};

let SECTION = {
	SECT_TEXT: "__text",
	SECT_FVMLIB_INIT0: "__fvmlib_init0",
	SECT_FVMLIB_INIT1: "__fvmlib_init1",
	SECT_DATA: "__data",
	SECT_BSS: "__bss",
	SECT_COMMON: "__common",
	SECT_OBJC_SYMBOLS: "__symbol_table",
	SECT_OBJC_MODULES: "__module_info",
	SECT_OBJC_STRINGS: "__selector_strs",
	SECT_OBJC_REFS: "__selector_refs",
	SECT_ICON_HEADER: "__header",
	SECT_ICON_TIFF: "__tiff",
	toString: function() {
		return JSON.stringify(this);
	}
};

var Section = function Section(sectname, segname, addr, size, offset, align, reloff, nreloc, flags, reserved1, reserved2) {
	this.sectname = new Uint8Array(16);
	this.segname = new Uint8Array(16);
	this.addr = addr || 0x00000000;
	this.size = size || 0x00000000;
	this.offset = offset || 0x00000000;
	this.align = align || 0x00000000;
	this.reloff = reloff || 0x00000000;
	this.nreloc = nreloc || 0x00000000;
	this.flags = flags || 0x00000000;
	this.reserved1 = reserved1 || 0x00000000;
	this.reserved2 = reserved2 || 0x00000000;
	this.toString = function() {
		return JSON.stringify(this);
	};
};

var Section64 = function Section64(sectname, segname, addr, size, offset, align, reloff, nreloc, flags, reserved1, reserved2, reserved3) {
	this.sectname = new Uint8Array(16);
	this.segname = new Uint8Array(16);
	this.addr = addr || 0x0000000000000000;
	this.size = size || 0x0000000000000000;
	this.offset = offset || 0x00000000;
	this.align = align || 0x00000000;
	this.reloff = reloff || 0x00000000;
	this.nreloc = nreloc || 0x00000000;
	this.flags = flags || 0x00000000;
	this.reserved1 = reserved1 || 0x00000000;
	this.reserved2 = reserved2 || 0x00000000;
	this.reserved3 = reserved3 || 0x00000000;
	this.toString = function() {
		return JSON.stringify(this);
	};
};