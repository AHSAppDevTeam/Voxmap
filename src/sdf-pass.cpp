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

const int N_FACES = 6;
const int N_VERTS = 6;
const int N_AXES = 3;
const int CUBE[N_FACES][N_VERTS][N_AXES] = { // Triangles of a cube
	{ // +Z
		{ 0, 0, 1 },
		{ 1, 0, 1 },
		{ 1, 1, 1 },
		{ 1, 1, 1 },
		{ 0, 1, 1 },
		{ 0, 0, 1 },
	}, { // -Z
		{ 0, 0, 0 },
		{ 0, 1, 0 },
		{ 1, 1, 0 },
		{ 1, 1, 0 },
		{ 1, 0, 0 },
		{ 0, 0, 0 },
	}, { // +Y
		{ 0, 1, 0 },
		{ 0, 1, 1 },
		{ 1, 1, 1 },
		{ 1, 1, 1 },
		{ 1, 1, 0 },
		{ 0, 1, 0 },
	}, { // -Y
		{ 0, 0, 0 },
		{ 1, 0, 0 },
		{ 1, 0, 1 },
		{ 1, 0, 1 },
		{ 0, 0, 1 },
		{ 0, 0, 0 },
	}, { // +X
		{ 1, 0, 0 },
		{ 1, 1, 0 },
		{ 1, 1, 1 },
		{ 1, 1, 1 },
		{ 1, 0, 1 },
		{ 1, 0, 0 },
	}, { // -X
		{ 0, 0, 0 },
		{ 0, 0, 1 },
		{ 0, 1, 1 },
		{ 0, 1, 1 },
		{ 0, 1, 0 },
		{ 0, 0, 0 },
	}
};

int col[Z][Y][X]; // color
int pal[MAX]; // palette
std::set <int> pal_set; // palette set
int bin[Z][Y][X]; // 1 if block, else 0
int sum[Z][Y][X]; // summed volume table
int sdf[Z][Y][X][O]; // radius of largest fittng cube centered at block
OpenSimplexNoise::Noise noise;


float arc(int a)
{
	return 6.283185 * (a - 2.0) / (Y - 4.0);
}
double simplex(int x, int y)
{
	double r = 1.0;
	return noise.eval(
			r * cos(arc(x)) + 1.0,
			r * sin(arc(x)) + 2.0,
			r * cos(arc(y)) + 3.0,
			r * sin(arc(y)) + 4.0
			);
}
int fractal(int x, int y, int octaves)
{
	double n = 0;
	for(int o = 0; o < octaves; o++){
		n += simplex(x << o, y << o) / (1 << o);
	}
	return 128 + std::clamp((int)(300 * n), -128, 127);
}

int main()
{
	// clamped sum access
	auto csum = [&](int z, int y, int x)
	{
		return sum
			[std::clamp(z,0,Z-1)]
			[std::clamp(y,0,Y-1)]
				[std::clamp(x,0,X-1)] ;
	};

	auto vol = [&]( int x0, int y0, int z0,
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

	std::cout << "Loading voxel map..." << std::flush;

	std::ifstream in("maps/map.txt");

	// Skip first 3 lines
	for(int i = 0; i < 3; i++) in.ignore(256, '\n');

	// Read input stream
	for (
			int x, y, z, color; 
			in >> std::dec >> x >> y >> z >> std::hex >> color;
	) {
		x += 512; y += 5; z += 0;
		pal_set.insert(color);
		col[z][y][x] = color;
		bin[z][y][x] = 1;
	}

	std::cout << "Done." << std::endl;

	std::cout << "Generating palette..." << std::endl;

	{
		std::cout << "  return ";
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

	FOR_XYZ {
		int i = 0;
		for (; i < MAX && pal[i] != col[z][y][x]; i++) continue;
		col[z][y][x] = i;
	}

	std::cout << "Done." << std::endl;

	std::cout << "Writing to vertex file..." << std::flush;

	std::ofstream o_position("out/position.bin", std::ios::binary);
	std::ofstream o_color("out/color.bin", std::ios::binary);

	auto o_position_put = [&](int x)
	{
		o_position.put((char)(x & 0xFF));
		o_position.put((char)(x >> 8));
	};
	auto quad = [&](int x, int y, int z, int c, int i)
	{
		for(int v = 0; v < N_VERTS; v++) {
			o_position_put(x + CUBE[i][v][0]);
			o_position_put(y + CUBE[i][v][1]);
			o_position_put(z + CUBE[i][v][2]);
			o_color.put((char) c);
		}
	};

	FOR_XYZ {
		if(bin[z][y][x] == 0) continue;
		int c = col[z][y][x];
		if(z == Z-1 || c != col[z+1][y][x]) quad(x,y,z,c,0);
		if(z == 0   || c != col[z-1][y][x]) quad(x,y,z,c,1);
		if(y == Y-1 || c != col[z][y+1][x]) quad(x,y,z,c,2);
		if(y == 0   || c != col[z][y-1][x]) quad(x,y,z,c,3);
		if(x == X-1 || c != col[z][y][x+1]) quad(x,y,z,c,4);
		if(x == 0   || c != col[z][y][x-1]) quad(x,y,z,c,5);
	}

	o_position.close();
	o_color.close();

	std::cout << "Done." << std::endl;

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

		if(bin[z][y][x] > 0) continue;

		// compute volume with summed volume table
		int r = 1;
		while(
			(r < Z) &&
			(0 == vol(
				x-r,y-r,z,
				x+r,y+r,z+r
			))
		) r++;

		sdf[z][y][x][0] = r;

		r = 1;
		while(
			(r < z) && 
			(0 == vol(
				x-r,y-r,z-r,
				x+r,y+r,z
			))
		) r++;

		sdf[z][y][x][1] = r;
	}

	std::cout << "Done." << std::endl;
	std::cout << "Writing to texture file..." << std::flush;

	std::ofstream o_texture("out/texture.bin", std::ios::binary);

	FOR_XYZ {
		int _x = x;
		int _y = Y*z + y;

		o_texture.put((char) sdf[z][y][x][0]);
		o_texture.put((char) sdf[z][y][x][1]);
		o_texture.put((char) col[z][y][x]);
		o_texture.put(
				(char) (
					_y/Y < 1 ? fractal(_x, _y, 8) :
					_y/Y < 2 ? std::rand() % 256 :
					0
					)
				);
	}

	o_texture.close();

	std::cout << "Done." << std::endl;
	std::cout << "^_^" << std::endl;;

	return 0;

}
