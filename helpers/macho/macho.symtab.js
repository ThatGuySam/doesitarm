var SymtabCommand = function SymtabCommand(cmd, cmdsize, symoff, nsyms, stroff, strsize) {
    this.cmd = cmd || 0x00000000;
    this.cmdsize = cmdsize || 0x00000000;
    this.symoff = symoff || 0x00000000;
    this.nsyms = nsyms || 0x00000000;
    this.stroff = stroff || 0x00000000;
    this.strsize = strsize || 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    };
};

var DySymtabCommand  = function DySymtabCommand(cmd, 
    cmdsize, 
    ilocalsym,
    nlocalsym, 
    iextdefsym, 
    nextdefsym, 
    iundefsym, 
    nundefsym, 
    ntoc, 
    modtaboff, 
    nmodtab, 
    extrefsymoff, 
    nextrefsymoff, 
    nextrefsyms,
    indirectsymoff,
    ninderectsyms,
    extreloff,
    nextrel,
    locreloff,
    nlocrel) {
    this.cmd = cmd || 0x00000000;
    this.cmdsize = cmdsize || 0x00000000;
    this.ilocalsym = ilocalsym || 0x00000000;
    this.nlocalsym = nlocalsym || 0x00000000;
    this.iextdefsym = iextdefsym || 0x00000000;
    this.nextdefsym = nextdefsym || 0x00000000;
    this.iundefsym = iundefsym || 0x00000000;
    this.nundefsym = nundefsym || 0x00000000;
    this.ntoc = ntoc || 0x00000000;
    this.modtaboff = modtaboff || 0x00000000;
    this.nmodtab = nmodtab || 0x00000000;
    this.extrefsymoff = extrefsymoff || 0x00000000;
    this.nextrefsymoff = nextrefsymoff || 0x00000000;
    this.nextrefsyms = nextrefsyms || 0x00000000;
    this.indirectsymoff= indirectsymoff || 0x00000000;
    this.ninderectsyms = ninderectsyms || 0x00000000;
    this.extreloff = extreloff || 0x00000000;
    this.nextrel = nextrel || 0x00000000;
    this.locreloff = locreloff || 0x00000000;
    this.nlocrel = nlocrel || 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    };
};