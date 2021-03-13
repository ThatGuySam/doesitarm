var UUIDCommand = function UUIDCommand(cmd, cmdsize, uuid) {
    this.cmd = cmd || 0x00000000;
    this.cmdsize = cmdsize || 0x00000000;
    this.uuid = uuid || new Uint8Array(16); //needs better input validation
    this.toString = function() {
        return JSON.stringify(this);
    };
};