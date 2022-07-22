//Global Constants
var MAGICS = [];


/*
	@Class MAGIC

	@Description
	Magic is a specific byte that indicates what for file it is.
	In Mach-O there a multiple magics differing from endianess, bits or file type.
*/
let MAGIC =
{

    //Macho Magics

    // cafebabe: Universal Binary Big Endian. These fat binaries are archives that can include binaries for multiple architectures, but typically contain PowerPC, Intel x86, or ARM.
    FAT_MAGIC: 0xcafebabe,

    // bebafeca: NXSwapLong(FAT_MAGIC)
    FAT_CIGAM: 0xbebafeca,

    // cafebabf: ???
    FAT_MAGIC64: 0xcafebabf,

    // bfbafeca: ???
    FAT_CIGAM64: 0xbfbafeca,

    // feedface: Mach-O Big Endian (32-bit)
    MH_MAGIC: 0xfeedface,

    // cefaedfe: Mach-O Little Endian (32-bit)
    MH_CIGAM: 0xcefaedfe,

    // feedfacf: Mach-O Big Endian (64-bit)
    MH_MAGIC64: 0xfeedfacf,

    // cffaedfe: Mach-O Little Endian (64-bit)
    MH_CIGAM64: 0xcffaedfe,

    //Retrieve the magic name of a specified magic
    //If an invalid magic was specifed undefined is returned
    KEYFORVALUE: function(value) {
        return MAGICS[value];
    },

    //Validate that a specified magic is correct
    VALIDATE: function(magic) {

        return MAGIC.KEYFORVALUE(magic) != undefined;
    },

    //returns true if the specified magic is a little-endian magic
    ISLITTLEENDIAN: function(magic) {

        if(!MAGIC.VALIDATE(magic)) //If it is not a valid magic we are basically done here
            return false;

        return MAGIC.KEYFORVALUE(magic).split('CIGAM').length > 1; //hacky trick to check if the magic value's keyname contains CIGAM which basically indicates little endian
    },

    //returns true if the specified magic is 64-bit
    IS64BIT: function(magic) {

        if(!MAGIC.VALIDATE(magic))
            return false;

        return MAGIC.KEYFORVALUE(magic).split('64').length > 1; //hacky trick to check if the magic value's keyname contains 64 which basically indicates 64-bit
    },

    toString : function() {
        return JSON.stringify(this);
    },

    debugdescription: ""
};

MAGICS[MAGIC.FAT_MAGIC] = "FAT_MAGIC";
MAGICS[MAGIC.FAT_CIGAM] = "FAT_CIGAM";
MAGICS[MAGIC.FAT_MAGIC64] = "FAT_MAGIC64";
MAGICS[MAGIC.FAT_CIGAM64] = "FAT_CIGAM64";
MAGICS[MAGIC.MH_MAGIC] = "MH_MAGIC";
MAGICS[MAGIC.MH_CIGAM] = "MH_CIGAM";
MAGICS[MAGIC.MH_MAGIC64] = "MH_MAGIC64";
MAGICS[MAGIC.MH_CIGAM64] = "MH_CIGAM64";


export { MAGIC, MAGICS }
