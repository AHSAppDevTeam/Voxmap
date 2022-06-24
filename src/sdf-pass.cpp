#include "voxmap.h"
#include "../libs/pnm.hpp"
#include <iostream>
#include <cassert>
#include <set>

const int GAP = 8;
const int MAX = 255/GAP;

pnm::rgb_pixel col[Z][Y][X]; // color
pnm::rgb_pixel pal[MAX]; // palette
std::set <pnm::rgb_pixel> pal_set; // palette set
int bin[Z][Y][X]; // 1 if block, else 0
int sum[Z][Y][X]; // summed volume table
int sdf[Z][Y][X]; // radius of largest fittng cube centered at block

int main()
{
	using namespace pnm::literals;

	pnm::image<pnm::rgb_pixel> img = pnm::read("maps/map.ppm");

	assert( X == img.width() );
	assert( Y*Z == img.height() );

	// clamped sum access
	auto csum = [&](int _z, int _y, int _x){
		return sum
			[std::clamp(_z,0,Z-1)]
			[std::clamp(_y,0,Y-1)]
				[std::clamp(_x,0,X-1)] ;
	};

	FOR_XYZ {
		pnm::rgb_pixel pixel = img[Y*z + y][x];
		// add to palette
		pal_set.insert(pixel);
		// put image bits into 3D existence table
		col[z][y][x] = pixel;
		bin[z][y][x] = (int(pixel.red) + int(pixel.blue) + int(pixel.blue) > 0) ? 1 : 0;
	}

	{
		std::cout << "return ";
		int i = 0;
		for (pnm::rgb_pixel pixel : pal_set) {
			std::cout << "p<=" << i << "?";
			std::cout << "vec3(";
			std::cout << float(pixel.red)/255.0 << ",";
			std::cout << float(pixel.green)/255.0 << ",";
			std::cout << float(pixel.blue)/255.0 << "):";
			pal[i] = pixel;
			i++;
		}
		std::cout << "vec3(1);" << std::endl;
	}

	FOR_XYZ {
		// compute a summed volume table
		// aka: the number of blocks in the cube
		// with diagonal (0,0,0)---(z,y,x), inclusive
		sum[z][y][x] = bin[z][y][x]

			+ csum(z-1, y, x)
			+ csum(z, y-1, x)
			+ csum(z, y, x-1)

			- csum(z, y-1, x-1)
			- csum(z-1, y, x-1)
			- csum(z-1, y-1, x)

			+ csum(z-1, y-1, x-1)
			;
		//std::cout << sum[z][y][x] << " ";
	}

	FOR_XYZ {
		// find greatest allowable cube's radius as sdf

		if(bin[z][y][x] > 0){
			// no cube inside blocks
			sdf[z][y][x] = 0;
			continue;
		}

		for(int r = 1; r < Z; r++){
			// compute volume with summed volume table
			int vol = 0

				- csum(z-r, y+r, x+r)
				- csum(z+r, y-r, x+r)
				- csum(z+r, y+r, x-r)

				+ csum(z+r, y+r, x+r)

				+ csum(z+r, y-r, x-r)
				+ csum(z-r, y+r, x-r)
				+ csum(z-r, y-r, x+r)

				- csum(z-r, y-r, x-r)
				;

			// stop if there exists a block
			if(vol > 0) {
				sdf[z][y][x] = r;
				break;
			}
		}
	}

	FOR_XYZ {
		img[Y*z + y][x].red = sdf[z][y][x] * GAP;

		int col_index = 0;
		for (; col_index < MAX && pal[col_index] != col[z][y][x]; col_index++) { continue; }
		img[Y*z + y][x].green = col_index * GAP;

		img[Y*z + y][x].blue = 0;
	}

	pnm::write("maps/texture.ppm", img, pnm::format::binary);

	return 0;
}

