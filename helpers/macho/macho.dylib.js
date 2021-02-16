var Dylib = function Dylib(name, timestamp, current_version, compatibility_version) {
    this.name = name || 0x00000000;
    this.timestamp = timestamp || 0x00000000;
    this.current_version = current_version || 0x00000000;
    this.compatibility_version = compatibility_version || 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    };
};

var DylibCommand = function DylibCommand(cmd, cmdsize, dylib) {
    this.cmd = cmd || 0x00000000;
    this.cmdsize = cmdsize || 0x00000000;
    this.dylib = dylib || new Dylib(); //needs better input validation
    this.toString = function() {
        return JSON.stringify(this);
    };
};

var DylibTableOfContents = function DylibTableOfContents(symbol_index, module_index) {
    this.symbol_index = symbol_index || 0x00000000;
    this.module_index = module_index || 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    };
};

var DylibModule = function DylibModule(module_name, iextdefsym, nextdefsym, irefsym, nrefsym, ilocalsym, nlocalsym, iextrel, nextrel, iinit_iterm, ninit_nterm, objc_module_info_addr, objc_module_info_size) {
    this.module_name = module_name || 0x00000000;
    this.iextdefsym = iextdefsym || 0x00000000;
    this.nextdefsym = nextdefsym || 0x00000000;
    this.irefsym = irefsym || 0x00000000;
    this.nrefsym = nrefsym || 0x00000000;
    this.ilocalsym = ilocalsym || 0x00000000;
    this.nlocalsym = nlocalsym || 0x00000000;
    this.iextrel = iextrel || 0x00000000;
    this.nextrel = nextrel || 0x00000000;
    this.iinit_iterm = iinit_iterm || 0x00000000;
    this.ninit_nterm = ninit_nterm || 0x00000000;
    this.objc_module_info_addr = objc_module_info_addr || 0x00000000;
    this.objc_module_info_size = objc_module_info_size || 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    };
};

var DylibModule64 = function DylibModule64(module_name, iextdefsym, nextdefsym, irefsym, nrefsym, ilocalsym, nlocalsym, iextrel, nextrel, iinit_iterm, ninit_nterm, objc_module_info_addr, objc_module_info_size) {
    this.module_name = module_name || 0x00000000;
    this.iextdefsym = iextdefsym || 0x00000000;
    this.nextdefsym = nextdefsym || 0x00000000;
    this.irefsym = irefsym || 0x00000000;
    this.nrefsym = nrefsym || 0x00000000;
    this.ilocalsym = ilocalsym || 0x00000000;
    this.nlocalsym = nlocalsym || 0x00000000;
    this.iextrel = iextrel || 0x00000000;
    this.nextrel = nextrel || 0x00000000;
    this.iinit_iterm = iinit_iterm || 0x00000000;
    this.ninit_nterm = ninit_nterm || 0x00000000;
    this.objc_module_info_addr = objc_module_info_addr || 0x00000000;
    this.objc_module_info_size = objc_module_info_size || 0x0000000000000000;
    this.toString = function() {
        return JSON.stringify(this);
    };
};

var DylibReference = {
    isym:24,
    flags:8,
    toString: function() {
        return JSON.stringify(this);
    }
};