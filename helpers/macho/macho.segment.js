//Global Constants
var SG_FLAGS = [];

let SG_FLAG = {
    SG_HIGHVM: 0x1,
    SG_FVMLIB: 0x2,
    SG_NORELOC: 0x4,

    DESCRIPTION: function(search) {
        let result = SG_FLAGS[search];
        return (result != undefined) ? result : search;
    },

    toString: function() {
        return JSON.stringify(this);
    }
};

SG_FLAGS[SG_FLAG.SG_HIGHVM] = 'SG_HIGHVM';
SG_FLAGS[SG_FLAG.SG_FVMLIB] = 'SG_FVMLIB';
SG_FLAGS[SG_FLAG.SG_NORELOC] = 'SG_NORELOC';

let SEGMENT = {
    SEG_PAGEZERO: "__PAGEZERO",
    SEG_TEXT: "__TEXT",
    SEG_ICON: "__ICON",
    SEG_OBJC: "__OBJC",
    SEG_LINKEDIT: "__LINKEDIT",
    SEG_UNIXSTACK: "__UNIXSTACK",
    SEG_DATA: "__DATA",
    toString: function() {
        return JSON.stringify(this);
    }
};

//32-bits segment command
var SegmentCommand = function SegmentCommand(type, size, segname, vmaddr, vmsize, fileoff, filesize, maxprot, initprot, nsects, flags) {
    this.cmd = type || 0x00000000;
    this.cmdsize = size || 0x00000000;
    this.segname = new TextEncoder("utf-8").encode(segname) || new Uint8Array(16);
    this.vmaddr = vmaddr || 0x00000000;
    this.vmsize = vmsize || 0x00000000;
    this.fileoff = fileoff || 0x00000000;
    this.filesize = filesize || 0x00000000;
    this.maxprot = maxprot || 0x00000000;
    this.initprot = initprot || 0x00000000;
    this.nsects = nsects || 0x00000000;
    this.flags = flags || 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    };
};

//64-bits segment command
var SegmentCommand64 = function SegmentCommand64(cmd, cmdsize, segname, vmaddr, vmsize, fileoff, filesize, maxprot, initprot, nsects, flags) {
    this.cmd = cmd || 0x00000000;
    this.cmdsize = cmdsize || 0x00000000;
    this.segname = new TextEncoder("utf-8").encode(segname) || new Uint8Array(16);
    this.vmaddr = vmaddr || 0x0000000000000000;
    this.vmsize = vmsize || 0x0000000000000000;
    this.fileoff = fileoff || 0x0000000000000000;
    this.filesize = filesize || 0x0000000000000000;
    this.maxprot = maxprot || 0x00000000;
    this.initprot = initprot || 0x00000000;
    this.nsects = nsects || 0x00000000;
    this.flags = flags || 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    };
};


export { SG_FLAGS, SG_FLAG, SEGMENT, SegmentCommand, SegmentCommand64 }
