#include "MagicaVoxel_File_Writer/VoxWriter.h"

#include <string>
#include <cmath>
#include <fstream>
#include <iostream>
#include <sstream>

using namespace std;

int main()
{
    int width = 0;    //Number of columns
    int height = 0;   //Number of rows
    int maxColor = 0;
    char type[3]; // pgm

    vox::VoxWriter vox;

    ifstream f0("out-pgm/layer0.pgm");
    ifstream f1("out-pgm/layer1.pgm");
    ifstream f2("out-pgm/layer2.pgm");


    f0 >> type >> width >> height >> maxColor;
    f1 >> type >> width >> height >> maxColor;
    f2 >> type >> width >> height >> maxColor;
    
    int GRASS = 153; // green
    int STEEL = 159; // blue gray
    int CONCRETE = 106; // gray
    int WALL = 1; // white
    int ROOF = 30; // maroon

    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            int depth;
            int structure;
            int paint;

            int color;

            f0 >> depth;
            f1 >> structure;
            f2 >> paint;

            depth /= 15;
            structure /= 15;
            paint /= 15;

            if(paint > 6){ // grass
                color = GRASS;
            } else if (paint > 2) { // steel
                color = STEEL;
            } else if (paint > 1) {
                color = WALL;
            } else if (paint > 0) {
                color = ROOF;
            } else {
                color = CONCRETE;
            }

            if(depth > 0) {
                vox.AddVoxel(x, y, 0, CONCRETE);
            }
            if (structure > 14) { // pole or roof

                vox.AddVoxel(x, y, depth, color);

                if (structure > 15) { // if roof, two-tone
                    color = WALL;
                }

                for (int z = 1; z < depth; z++) {
                    vox.AddVoxel(x, y, z, color);
                }

            } else {
                vox.AddVoxel(x, y, depth, color);
            }
        }
    }

    vox.SaveToFile("out.vox");
}

