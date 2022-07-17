#include "voxmap.h"
#include <cstdlib>
#include <iostream>
#include <fstream>

int main()
{
	std::ofstream out("src/noise.bin", std::ios::binary);

	for(int i = 0; i < 3*128*128; i++)
		out.put((char) (std::rand() % 256));

	out.close();

	std::cout << "Done." << std::endl;

	return 0;
}
