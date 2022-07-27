#include "voxmap.h"
#include "OpenSimplexNoise/OpenSimplexNoise.h"
#include <math.h>
#include <fstream>
#include <iostream>

OpenSimplexNoise::Noise noise;
std::ofstream o_noise("out/noise.bin", std::ios::binary);

auto arc = [](int a)
{
	return (6.283185 * a) / X;
};
auto simplex = [](int x, int y)
{
	double r = 1.0;
	return noise.eval(
			r * cos(arc(x)) + 1.0,
			r * sin(arc(x)) + 2.0,
			r * cos(arc(y)) + 3.0,
			r * sin(arc(y)) + 4.0
			);
};
auto fractal = [](int x, int y, int octaves)
{
	double n = 0;
	for(int o = 0; o < octaves; o++){
		n += simplex(x << o, y << o) / (1 << o);
	}
	return 128 + std::clamp((int)(300 * n), -128, 127);
};

int main() {
	for(int x = 0; x < X; x++)
	for(int y = 0; y < X; y++)
	{
		o_noise.put((char) std::rand() % 256);
		o_noise.put((char) fractal(x, y, 10));
		o_noise.put((char) 0);
		o_noise.put((char) 0);
	}
	o_noise.close();
}
