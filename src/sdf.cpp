#include "voxmap.h"
#include <math.h>
#include <iostream>
#include <cstdlib>
#include <fstream>
#include <algorithm>
#include <set>

const int MAX = 255;
const int O = 2; // Two octants, down(0) and up(1)

int pal[MAX]; // palette
std::set<int> pal_set; // palette set
int col[X][Y][Z]; // color
int bin[X][Y][Z]; // 1 if block, else 0
int sum[X][Y][Z]; // summed volume table
int sdf[X][Y][Z][O]; // radius of largest fittng cube centered at block

std::ifstream in("maps/map.txt");
std::ofstream o_vertex("out/vertex.bin", std::ios::binary);
std::ofstream o_texture("out/texture.bin", std::ios::binary);

// clamped sum access
auto csum = [](int x, int y, int z)
{ 
	return sum
		[std::clamp(x,0,X-1)]
		[std::clamp(y,0,Y-1)]
		[std::clamp(z,0,Z-1)];
};

// clamped col access
auto ccol = [](int x, int y, int z)
{ 
	return col
		[std::clamp(x,0,X-1)]
		[std::clamp(y,0,Y-1)]
		[std::clamp(z,0,Z-1)];
};

// clamped csdf access
auto csdf = [](int x, int y, int z, int o)
{ 
	return sdf
		[std::clamp(x,0,X-1)]
		[std::clamp(y,0,Y-1)]
		[std::clamp(z,0,Z-1)]
		[o];
};

auto vol = [](
		int x0, int y0, int z0,
		int x1, int y1, int z1
		)
{
	x0--;
	y0--;
	z0--;
	return 0
		- csum(x1, y1, z0)
		- csum(x1, y0, z1)
		- csum(x0, y1, z1)

		+ csum(x1, y1, z1)

		+ csum(x0, y0, z1)
		+ csum(x0, y1, z0)
		+ csum(x1, y0, z0)

		- csum(x0, y0, z0);
};

auto o_vertex_8 = [](int x)
{
	o_vertex.put((char)(x & 0xFF));
};
auto o_vertex_16 = [](int x) // Split 2-byte ints
{
	o_vertex_8(x);
	o_vertex_8(x >> 8);
};
auto vert = [](int x, int y, int z, int dx, int dy, int dz, int color, int normal, int id)
{
	o_vertex_16(x); o_vertex_16(y); o_vertex_16(z);
	o_vertex_16(dx); o_vertex_16(dy); o_vertex_16(dz);
	o_vertex_8(color);
	o_vertex_8(normal);
	o_vertex_8(id);
	o_vertex_8(0);
};
auto tri = [](
		int x, int y, int z,
		int dx0, int dy0, int dz0,
		int dx1, int dy1, int dz1,
		int dx2, int dy2, int dz2,
		int color, int normal, int id
		)
{
	vert(x, y, z, dx0, dy0, dz0, color, normal, id);
	if(normal%2) {
		vert(x, y, z, dx2, dy2, dz2, color, normal, id);
		vert(x, y, z, dx1, dy1, dz1, color, normal, id);
	} else {
		vert(x, y, z, dx1, dy1, dz1, color, normal, id);
		vert(x, y, z, dx2, dy2, dz2, color, normal, id);
	}
};
auto quad = [](
		int x, int y, int z,
		int dx0, int dy0, int dz0,
		int dx1, int dy1, int dz1,
		int color, int normal, int id
		)
{
	tri(
			x, y, z,
			0, 0, 0,
			dx0, dy0, dz0,
			dx1, dy1, dz1,
			color, normal, id
		);
	tri(
			x, y, z,
			dx1, dy1, dz1,
			dx0, dy0, dz0,
			dx0+dx1, dy0+dy1, dz0+dz1,
			color, normal, id
		);
};

int main()
{
	// so nothing fails silently
	in.exceptions(std::fstream::badbit);
	o_texture.exceptions(std::fstream::badbit);
	o_vertex.exceptions(std::fstream::badbit);
	
	std::cout << "Loading voxel map..." << std::flush;

	// Skip first 3 lines
	for(int i = 0; i < 3; i++) in.ignore(256, '\n');

	// Read input stream
	pal_set.insert(0);
	for (
			int x, y, z, color;
			in >> std::dec >> x >> y >> z >> std::hex >> color;
		 ) {
		x += 512; y += 5; z += 0;
		pal_set.insert(color);
		col[x][y][z] = color;
		bin[x][y][z] = 1;
	}

	in.close();

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

	parXYZ([](int x, int y, int z){
		int i = 1;
		for (; i < MAX && pal[i] != col[x][y][z]; i++) continue;
		col[x][y][z] = i;
	});

	std::cout << "Done." << std::endl;

	std::cout << "Writing to vertex file..." << std::flush;

	// https://gist.github.com/Vercidium/a3002bd083cce2bc854c9ff8f0118d33
	
	forChunkXYZ([](int cx, int cy, int cz) {
		for(int d = 0; d < 3; d++) // dimensions
		for(int normal = 0; normal < 2; normal++)
		for(int color = 0; color < pal_set.size(); color++)
		{
			int i = 0, j = 0, k = 0, l = 0, w = 0, h = 0;
			int u = (d + 1) % 3;
			int v = (d + 2) % 3;

			int p[3] = { 0, 0, 0 };
			int n[3] = { 0, 0, 0 };

			bool mask[CHUNK][CHUNK];
			n[d] = 1;

			for(p[d] = -1; p[d] < CHUNK;) {
				for(p[v] = 0; p[v] < CHUNK; p[v]++)
				for(p[u] = 0; p[u] < CHUNK; p[u]++) {
					bool block = color == ccol(cx+p[0],      cy+p[1],      cz+p[2]     );
					bool ahead = color == ccol(cx+p[0]+n[0], cy+p[1]+n[1], cz+p[2]+n[2]);

					mask[p[v]][p[u]] =
							(normal==0 && block && !ahead) || 
							(normal==1 && !block && ahead)
					;
				}
				
				p[d]++;

				for(j = 0; j < CHUNK; j++)
				for(i = 0; i < CHUNK; i++)
				{
					if(!mask[j][i]) continue;

					for(w=1; i+w < CHUNK && mask[j][i+w]; w++) continue;

					for(h = 1; j + h < CHUNK; h++)
					for(k = 0; k < w; k++)
					{
						if(!mask[j+h][i+k]) goto break2;
					}
					break2:

					p[u] = i;
					p[v] = j;

					int du[3] = {0, 0, 0};
					int dv[3] = {0, 0, 0};

					du[u] = w;
					dv[v] = h;
					int id = 0;
					quad(
							cx+p[0], cy+p[1], cz+p[2],
							du[0], du[1], du[2],
							dv[0], dv[1], dv[2],
							color, d*2 + normal, id
						 );

					for (l = 0; l < h; l++)
					for (k = 0; k < w; k++)
					{
						mask[j+l][i+k] = false;
					}

					i--;
					i += w;
				}
			}
		}
	});

	// Draw skybox
	{
		quad(
			0, 0, Z,
			X, 0, 0,
			0, Y, 0,
			0, 1, 1
		);
		quad(
			0, 0, 0,
			X, 0, 0,
			0, 0, Z,
			0, 1, 1
		);
		quad(
			X, 0, 0,
			0, Y, 0,
			0, 0, Z,
			0, 1, 1
		);
		quad(
			X, Y, 0,
			-X, 0, 0,
			0, 0, Z,
			0, 1, 1
		);
		quad(
			0, Y, 0,
			0,-Y, 0,
			0, 0, Z,
			0, 1, 1
		);
	}


	std::cout << "Done." << std::endl;

	std::cout << "Generating summed volume table..." << std::flush;

	forXYZ([](int x, int y, int z) {
		// compute a summed volume table
		// aka: the number of blocks in the cube
		// with diagonal (0,0,0)---(z,y,x), inclusive
		sum[x][y][z] = bin[x][y][z]

			+ csum(  x,   y, z-1)
			+ csum(  x, y-1,   z)
			+ csum(x-1,   y,   z)

			- csum(x-1, y-1,   z)
			- csum(x-1,   y, z-1)
			- csum(  x, y-1, z-1)

			+ csum(x-1, y-1, z-1);
	});

	std::cout << "Done." << std::endl;

	std::cout << "Generating signed distance fields..." << std::flush;

	// find greatest allowable cube's radius as sdf
	forXYZ([](int x, int y, int z) {
		if(bin[x][y][z] > 0) return;

		// two octants: up and down
		for(int o = 0; o < O; o++) {
			// compute volume with summed volume table

			int min = 1;
			int max = (o == 0) ? Z : z;

			// exploit fact that SDFs have a max gradient of 1
			if(x+y+z > 0) {
				int mid = csdf(x-1, y-1, z-1, o);
				min = std::max(min, mid-1);
				max = std::min(max, mid+1);
			}

			int r = min;
			while(
					(r < max) &&
					(0 == vol(
								 x-r,y-r,z-(o)*r,
								 x+r,y+r,z+(1-o)*r
								))
				  ) r++;

			sdf[x][y][z][o] = r;
		}
	});

	std::cout << "Done." << std::endl;
	std::cout << "Writing to texture file..." << std::flush;

	forZYX([](int x, int y, int z) {
		int _x = x;
		int _y = Y*z + y;

		o_texture.put((char) sdf[x][y][z][0]);
		o_texture.put((char) sdf[x][y][z][1]);
		o_texture.put((char) col[x][y][z]);
		o_texture.put((char) 0);
	});

	o_texture.close();

	std::cout << "Done." << std::endl;
	std::cout << "^_^" << std::endl;

	return 0;

}
