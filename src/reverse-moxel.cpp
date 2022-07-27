#include "voxmap.h"
#include "../libs/pnm.hpp"
#include <cassert>
#include <set>

#include "../libs/MagicaVoxel_File_Writer/VoxWriter.h"


int main()
{
    using namespace pnm::literals;

    pnm::image<pnm::rgb_pixel> img = pnm::read("maps/texture.ppm");

    vox::VoxWriter vox;

    FOR_XYZ {
        if(int(img[Y*z + y][x].red) == 0) {
            int g = 256 - int(img[Y*z + y][x].green);
            g = (g > 240) ? 248 : (g > 220) ? 236 : (g > 155) ? 159 : (g > 150) ? 153 : (g>100) ? 106 : (g>20) ? 30 : 1;
            vox.AddVoxel(x, y, Z-z, g);
        }
    }

    vox.SaveToFile("maps/map.vox");
}

