#include "voxmap.h"
#include "OpenSimplexNoise/OpenSimplexNoise.h"
#include <math.h>
#include <iostream>
#include <cstdlib>
#include <fstream>
#include <cassert>
#include <set>

const int MAX = 255;
const int O = 2; // Two octants, down(0) and up(1)

int col[Z][Y][X]; // color
int pal[MAX]; // palette
std::set <int> pal_set; // palette set
int bin[Z][Y][X]; // 1 if block, else 0
int sum[Z][Y][X]; // summed volume table
int sdf[Z][Y][X][O]; // radius of largest fittng cube centered at block
OpenSimplexNoise::Noise noise;

// clamped sum access
int csum(int z, int y, int x)
{
	return sum
		[std::clamp(z,0,Z-1)]
		[std::clamp(y,0,Y-1)]
		[std::clamp(x,0,X-1)] ;
};

int vol( int x0, int y0, int z0,
			int x1, int y1, int z1 )
{
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


float arc(int a)
{
	return 6.283185 * (a + 2.0) / (X + 4.0);
}
int simplex(int x, int y)
{
	double r = 1.0;
	return (int) (100.0 * noise.eval(
			r * cos(arc(x)) + 1.0, 
			r * sin(arc(x)) + 2.0, 
			r * cos(arc(y)) + 3.0, 
			r * sin(arc(y)) + 4.0
		));
}

int fractal(int _x, int _y, int octaves)
{
	int n = 0;
	for(int o = 0; o < octaves; o++){
		n += simplex(_x << o, _y << o) >> o;
	}
	return 128 + std::clamp(n, -128, 127);
}

int main()
{
	std::cout << "Loading voxel map..." << std::flush;

	std::ifstream in("maps/map.txt");

	{
		// Skip first 3 lines
		for(int i = 0; i < 3; i++) in.ignore(256, '\n');

		int x, y, z, color;
		while ( in >> std::dec >> x >> y >> z >> std::hex >> color ) {
			if(x > X || y > Y || z > Z) break;
			x += 512; y += 5; z += 0; // Goxel default offset
			pal_set.insert(color);
			col[z][y][x] = color;
			bin[z][y][x] = 1;
		}
	}

	std::cout << "Done." << std::endl;

	std::cout << "Generating palette..." << std::endl;

	std::cout << "\treturn ";
	{
		int i = 0;
		for (int color : pal_set) {
			std::cout << "p==" << i << "?";
			std::cout << "vec3(";
			std::cout << float((color >> 16) & 0xFF)/255.0 << ",";
			std::cout << float((color >> 8) & 0xFF)/255.0 << ",";
			std::cout << float((color >> 0) & 0xFF)/255.0 << "):";
			pal[i] = color;
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

	FOR_XYZ {
		// find greatest allowable cube's radius as sdf

		if(bin[z][y][x] > 0){
			// no cube inside blocks
			sdf[z][y][x][0] = 0;
			sdf[z][y][x][1] = 0;
			continue;
		} else {
			sdf[z][y][x][0] = Z;
			sdf[z][y][x][1] = z;
		}

		// compute volume with summed volume table
		for(int r = 1; r < Z; r++){
			// stop if there exists a block
			if(vol(
						x-r,y-r,z,
						x+r,y+r,z+r
					)) {
				sdf[z][y][x][0] = r;
				break;
			}
		}
		for(int r = 1; r < z; r++){
			// stop if there exists a block
			if(vol(
						x-r,y-r,z-r,
						x+r,y+r,z
					)) {
				sdf[z][y][x][1] = r;
				break;
			}
		}
	}

	std::cout << "Done." << std::endl;
	std::cout << "Writing to file..." << std::flush;

	std::ofstream out("maps/texture.bin", std::ios::binary);

	FOR_XYZ {
		int col_index = 0;
		for (; col_index < MAX && pal[col_index] != col[z][y][x]; col_index++) { continue; }

		int _x = x;
		int _y = Y*z + y;

		out.put((char) sdf[z][y][x][0]);
		out.put((char) sdf[z][y][x][1]);
		out.put((char) col_index);
		out.put(
			(char) (
				_y/X < 1 ? fractal(_x, _y, 8) :
				_y/X < 2 ? std::rand() % 256 :
				0
			)
		);
	}

	out.close();

	std::cout << "Done." << std::endl;
	std::cout << "^_^" << std::endl;;

	return 0;

}
