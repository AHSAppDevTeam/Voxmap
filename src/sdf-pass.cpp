#include "voxmap.h"
#include "OpenSimplexNoise/OpenSimplexNoise.h"
#include <math.h>
#include <iostream>
#include <cstdlib>
#include <fstream>
#include <cassert>
#include <set>
#include <algorithm>

const int MAX = 255;
const int O = 2; // Two octants, down(0) and up(1)

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
	auto clamped = [&](int array[Z][Y][X], int z, int y, int x)
	{
		return array
			[std::clamp(z,0,Z-1)]
			[std::clamp(y,0,Y-1)]
			[std::clamp(x,0,X-1)] ;
	};
	// clamped sum access
	auto csum = [&](int z, int y, int x)
	{
		return clamped(sum, z, y, x);
	};
	// clamped col access
	auto ccol = [&](int z, int y, int x)
	{
		return clamped(col, z, y, x);
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
		int i = 1;
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

	FOR_ZYX {
		int i = 1;
		for (; i < MAX && pal[i] != col[z][y][x]; i++) continue;
		col[z][y][x] = i;
	}

	std::cout << "Done." << std::endl;

	std::cout << "Writing to vertex file..." << std::flush;

	std::ofstream o_vertex("out/vertex.bin", std::ios::binary);

	auto o_vertex_8 = [&](int x)
	{
		o_vertex.put((char)(x & 0xFF));
	};
	auto o_vertex_16 = [&](int x) // Split 2-byte ints
	{
		o_vertex_8(x);
		o_vertex_8(x >> 8);
	};
	auto vert = [&](int x, int y, int z, int dx, int dy, int dz, int color, int id)
	{
		o_vertex_16(x); o_vertex_16(y); o_vertex_16(z);
		o_vertex_16(dx); o_vertex_16(dy); o_vertex_16(dz);
		o_vertex_8(color);
		o_vertex_8(0);
		o_vertex_8(id);
		o_vertex_8(0);
	};
	auto tri = [&](
			int x, int y, int z,
			int dx0, int dy0, int dz0,
			int dx1, int dy1, int dz1,
			int dx2, int dy2, int dz2,
			int color, int id
			)
	{
		vert(x, y, z, dx0, dy0, dz0, color, id);
		vert(x, y, z, dx1, dy1, dz1, color, id);
		vert(x, y, z, dx2, dy2, dz2, color, id);
	};
	auto quad = [&](
			int x, int y, int z,
			int dx0, int dy0, int dz0,
			int dx1, int dy1, int dz1,
			int color
			)
	{
		int id =0;
		tri(
				x, y, z,
				0, 0, 0,
				dx0, dy0, dz0,
				dx1, dy1, dz1,
				color, id
			);
		tri(
				x, y, z,
				dx1, dy1, dz1,
				dx0, dy0, dz0,
				dx0+dx1, dy0+dy1, dz0+dz1,
				color, id
			);
	};

	// https://gist.github.com/Vercidium/a3002bd083cce2bc854c9ff8f0118d33
	const int CHUNK = Z;
	for(int x = 0; x < X; x += CHUNK)
	for(int y = 0; y < Y; y += CHUNK)
	for(int z = 0; z < Z; z += CHUNK)
	for(int d = 0; d < 3; ++d)
	{
		int c = 0;
	for(int color : pal_set) 
	{
		c++;

		int i = 0, j = 0, k = 0, l = 0, w = 0, h = 0;
		int u = (d + 1) % 3;
		int v = (d + 2) % 3;

		int p[3] = { 0, 0, 0 };
		int q[3] = { 0, 0, 0 };

		bool mask[CHUNK * CHUNK];
		q[d] = 1;

		for(p[d] = -1; p[d] < CHUNK;) {
			int n = 0;
			for(p[v] = 0; p[v] < CHUNK; ++p[v])
			for(p[u] = 0; p[u] < CHUNK; ++p[u]) {
				bool block = c == ccol(z+p[2], y+p[1], x+p[0]);
				bool neighbor = c == ccol(z+p[2]+q[2], y+p[1]+q[1], x+p[0]+q[1]);

				mask[n++] = block != neighbor;
			}

			++p[d];
			n = 0;

			for(j = 0; j < CHUNK; ++j) {
				for(i = 0; i < CHUNK;) {
					if(mask[n]) {
						for(w=1; i+w < CHUNK && mask[n+w]; w++) { }
						bool done = false;
						for(h=1; j+h < CHUNK; h++) {
							for(k=0; k < w; ++k) {
								if(!mask[n+k+h*CHUNK]) {
									done = true;
									break;
								}
							}
							if(done) break;
						}
						p[u] = i;
						p[v] = j;
						int du[3] = {0, 0, 0};
						du[u] = w;
						int dv[3] = {0, 0, 0};
						dv[v] = h;

						quad(
								x+p[0], y+p[1], z+p[2],
								du[0], du[1], du[2],
								dv[0], dv[1], dv[2],
								c
							 );

						for (l = 0; l < h; ++l)
							for (k = 0; k < w; ++k)
								mask[n + k + l * CHUNK] = false;

						i += w;
						n += w;

					} else {
						i++;
						n++;
					}
				}
			}
		}
	}
	}

	o_vertex.close();

	std::cout << "Done." << std::endl;

	std::cout << "Generating summed volume table..." << std::flush;

	FOR_ZYX {
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

	FOR_ZYX {
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

	FOR_ZYX {
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
