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
    FAT_MAGIC: 0xcafebabe,
    FAT_CIGAM: 0xbebafeca,
    FAT_MAGIC64: 0xcafebabf,
    FAT_CIGAM64: 0xbfbafeca,
    MH_MAGIC: 0xfeedface,
    MH_CIGAM: 0xcefaedfe,
    MH_MAGIC64: 0xfeedfacf,
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
