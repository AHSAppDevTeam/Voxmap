#version 330 core
precision highp float;

out vec4 FragColor;

in vec2 TexCoord;

uniform highp sampler2D marchTexture0;
uniform highp sampler2D marchTexture1;
uniform highp sampler2D marchTexture2;
uniform highp sampler2D marchTexture3;
uniform int iFrame;
uniform int iTAA;

void main()
{
	ivec2 c = ivec2(gl_FragCoord.xy);
		FragColor = mix(
				mix(
				texelFetch(marchTexture0, c, 0),
				texelFetch(marchTexture1, c, 0),0.5
				),
			mix(
				texelFetch(marchTexture2, c, 0),
				texelFetch(marchTexture3, c, 0),0.5
				), 0.5
			);
}
