#include <cassert>
#include <cmath>
#include <fstream>
#include <iostream>
#include <iterator>
#include <sstream>
#include <string.h>
#include <string>
#include <vector>

#include "../libs/MagicaVoxel_File_Writer/VoxWriter.h"

using namespace std;

enum paints {
    Concrete,
    Roof,
    Wall,
    Steel,
    a,
    b,
    c,
    Bush,
    Grass,
};

enum colors {
    LushGreen = 153,
    ColdGray = 159,
    WarmGray = 106,
    Gray = 248,
    White = 1,
    Cardinal = 30,
};

int colorOf(int paint){
    switch(paint){
        case Concrete:
            return Gray;
        case Steel:
            return ColdGray;
        case Roof:
            return Cardinal;
        case Wall:
            return White;
        case Bush:
            return LushGreen;
        case Grass:
            return LushGreen;
        default:
            return Concrete;
    }
}

int main()
{
    string filetype;

    int width;
    int height;
    int max;

    string filedesc;

    ifstream f0("maps/pgm/layer0.pgm", ios::binary);
    ifstream f1("maps/pgm/layer1.pgm", ios::binary);
    ifstream f2("maps/pgm/layer2.pgm", ios::binary);

    f0 >> filetype >> width >> height >> max;
    f1 >> filetype >> width >> height >> max;
    f2 >> filetype >> width >> height >> max;

    getline(f0, filedesc);
    getline(f1, filedesc);
    getline(f2, filedesc);

    cout << filetype << endl;
    cout << width << " x " << height << " x " << max << endl;

    vector<unsigned char> b0(std::istreambuf_iterator<char>(f0), {});
    vector<unsigned char> b1(std::istreambuf_iterator<char>(f1), {});
    vector<unsigned char> b2(std::istreambuf_iterator<char>(f2), {});

    vox::VoxWriter vox;

    int i = 0;
    for (int y = 0; y < height; y++)
    for (int x = 0; x < width; x++)
    {
        int depth = b0[i];
        int structure = b1[i];
        int paint = b2[i];

        depth /= 15;
        structure /= 15;
        paint /= 15;

        int color = colorOf(paint);
        if(depth > 0) {
            vox.AddVoxel(x, y, 0, colorOf(Concrete));
        }
        if (structure > 13) { // pole or wall

            vox.AddVoxel(x, y, depth, color);

            if (structure > 15) { // if wall, two-tone
                color = colorOf(Wall);
            }

            for (int z = 1; z < depth; z++) {
                vox.AddVoxel(x, y, z, color);
            }

        } else {
            vox.AddVoxel(x, y, depth, color);
        }

        i++;
    }

    vox.SaveToFile("maps/map.vox");
}

