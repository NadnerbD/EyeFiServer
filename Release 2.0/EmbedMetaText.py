from PIL import Image, ImageFont, ImageDraw
from datetime import datetime
import os
import time
import glob
import sys

## EmbedMetaText.py
##
## Script to extract the beehive monitor meta-data I append to jpg files,
## and make that data part of the image. Input is jpg, out is png.
##
## Original implementation by Brendan Dorr.
## Changes by Gene Dorr.

def embedMeta(jpgfile, pngfile):
    # First, open the image just to extract the metadata
    imagefile = open(jpgfile, "rb")
    data = imagefile.read()
    imagefile.close()

    # Split on the metadata marker '###'
    arr = data.split("\n###\n")
    # in case '###' happens to randomly occur in the file, take the last item of the split
    if (len(arr) < 2) or (len(arr[-1]) > 80):
        print "%s does not contain meta text" % jpgfile
        return
    metaText = arr[-1]
    
    # Now open the image to embed the metadata and output the new image as PNG
    image = Image.open(jpgfile)
    try:
        draw = ImageDraw.Draw(image)
    except:
        print "%s contains corrupted image" % jpgfile
    else:
        myFontSize = 18
        myFont = ImageFont.truetype("CONSOLA.TTF", myFontSize)
    
        # Create a black outline of the metadata text
        xCoord = 7
        yCoord = image.size[1] - myFontSize - xCoord
        draw.text((xCoord-1, yCoord-1), metaText, font=myFont, fill="Black")
        draw.text((xCoord-1, yCoord+1), metaText, font=myFont, fill="Black")
        draw.text((xCoord+1, yCoord-1), metaText, font=myFont, fill="Black")
        draw.text((xCoord+1, yCoord+1), metaText, font=myFont, fill="Black")
        # Then write the metadata text in white in the middle of the outline
        draw.text((xCoord, yCoord), metaText, font=myFont, fill="White")

        image.save(pngfile)
        print "%s created" % pngfile
        
        # Update the file timestamp to match the metadata 
        try:
            metaTimestamp = datetime.strptime(metaText[0:19], "%Y/%m/%d %H:%M:%S")
            atime = time.mktime(metaTimestamp.timetuple())
            os.utime(pngfile, (atime, atime))
        except:
            print "%s contains corrupted metadata timestamp" % jpgfile

if __name__ == "__main__":
    location = sys.argv[1]
    print "Searching for %s" % (location + '/*.JPG')
    for filename in glob.glob(location + '/*.JPG'):
        embedMeta(filename, filename[0:-4]+".png")

