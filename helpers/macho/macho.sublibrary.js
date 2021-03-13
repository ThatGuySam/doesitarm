var SubLibraryCommand = function SubLibraryCommand(cmd, cmdsize, sub_library) {
    this.cmd = cmd || 0x00000000;
    this.cmdsize = cmdsize || 0x00000000;
    this.sub_library = sub_library || 0x00000000;
    this.toString = function() {
        return JSON.stringify(this);
    };
};