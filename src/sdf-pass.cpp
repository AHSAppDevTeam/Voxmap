#include "voxmap.h"
#include "../libs/pnm.hpp"
#include <iostream>
#include <cassert>
#include <set>

const int MAX = 255;
const int O = 2; // Two octants, down(0) and up(1)

pnm::rgb_pixel col[Z][Y][X]; // color
pnm::rgb_pixel pal[MAX]; // palette
std::set <pnm::rgb_pixel> pal_set; // palette set
int bin[Z][Y][X]; // 1 if block, else 0
int sum[Z][Y][X]; // summed volume table
int sdf[Z][Y][X][O]; // radius of largest fittng cube centered at block

int main()
{
	using namespace pnm::literals;

	std::cout << "Loading png slices..." << std::flush;

	pnm::image<pnm::rgb_pixel> img = pnm::read("maps/map.ppm");

	assert( X == img.width() );
	assert( Y*Z == img.height() );

	std::cout << "Done." << std::endl;
	std::cout << "Generating volume..." << std::flush;

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

	std::cout << "Done." << std::endl;
	std::cout << "Generating palette..." << std::endl;

	{
		int i = 0;
		for (pnm::rgb_pixel pixel : pal_set) {
			std::cout << "p==" << i << "?";
			std::cout << "vec3(";
			std::cout << float(pixel.red)/255.0 << ",";
			std::cout << float(pixel.green)/255.0 << ",";
			std::cout << float(pixel.blue)/255.0 << "):";
			pal[i] = pixel;
			i++;
		}
		std::cout << "vec3(1);" << std::endl;
	}

	std::cout << "Generating summed volume table..." << std::flush;

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
	
	std::cout << "Done." << std::endl;
	std::cout << "Generating signed distance fields..." << std::flush;

	auto vol = [&](
			int x0, int y0, int z0,
			int x1, int y1, int z1
	){
		x0--;
		y0--;
		z0--;
		return 0
			- csum(z0, y1, x1)
			- csum(z1, y0, x1)
			- csum(z1, y1, x0)

			+ csum(z1, y1, x1)

			+ csum(z1, y0, x0)
			+ csum(z0, y1, x0)
			+ csum(z0, y0, x1)

			- csum(z0, y0, x0);
	};

	FOR_XYZ {
		// find greatest allowable cube's radius as sdf

		if(bin[z][y][x] > 0){
			// no cube inside blocks
			sdf[z][y][x][0] = 0;
			sdf[z][y][x][1] = 0;
			continue;
		} else {
			sdf[z][y][x][0] = Z;
			sdf[z][y][x][1] = Z;
		}

		// compute volume with summed volume table
		for(int r = 1; r < Z; r++){
			// stop if there exists a block
			if(vol(
				x-r,y-r,z-r,
				x+r,y+r,z
			)) {
				sdf[z][y][x][0] = r;
				break;
			}
		}
		for(int r = 1; r < Z; r++){
			// stop if there exists a block
			if(vol(
				x-r,y-r,z,
				x+r,y+r,z+r
			)) {
				sdf[z][y][x][1] = r;
				break;
			}
		}
	}

	std::cout << "Done." << std::endl;
	std::cout << "Converting into RGBA..." << std::flush;

	FOR_XYZ {
		img[Y*z + y][x].red = sdf[z][y][x][0];
		img[Y*z + y][x].green = sdf[z][y][x][1];

		int col_index = 0;
		for (; col_index < MAX && pal[col_index] != col[z][y][x]; col_index++) { continue; }
		img[Y*z + y][x].blue = col_index;
	}
	for(int i = 0; i < 255; i++){
		img[i][0].red = i;
		img[256+i][0].blue = i;
		img[2*256 + i][0].green = i;
	}

	std::cout << "Done." << std::endl;
	std::cout << "Writing to file..." << std::flush;

	pnm::write("maps/texture.ppm", img, pnm::format::binary);

	std::cout << "Done." << std::endl;
	std::cout << "^_^" << std::endl;;

	return 0;
}

