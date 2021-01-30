//Mach-O Fat file header
export var FatHeader = function FatHeader() {
    this.magic = 0x00000000;
    this.nfat_arch = 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    }
};

//Mach-O Fat file header
export var FatArch = function FatArch() {
    this.cputype = 0x00000000;
    this.cpusubtype = 0x00000000;
    this.offset = 0x00000000;
    this.size = 0x00000000;
    this.align = 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    }
}

//Mach-O Binary Executable header 32-bit
export var MachoHeader = function MachoHeader() {
    this.magic = 0x00000000;
    this.cputype = 0x00000000;
    this.cpusubtype = 0x00000000;
    this.filetype = 0x00000000;
    this.ncmds = 0x00000000;
    this.sizeofcmds = 0x00000000;
    this.flags = 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    }
};

//Mach-O Binary Executable header 64-bit
export var MachoHeader64 = function MachoHeader64() {
    this.magic = 0x00000000;
    this.cputype = 0x00000000;
    this.cpusubtype = 0x00000000;
    this.filetype = 0x00000000;
    this.ncmds = 0x00000000;
    this.sizeofcmds = 0x00000000;
    this.flags = 0x00000000;
    this.reserved = 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    }
};
