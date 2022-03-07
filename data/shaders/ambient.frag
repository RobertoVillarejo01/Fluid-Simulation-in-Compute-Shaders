#version 430

out vec4 outputColor;
in  vec2 uvs;

layout(location = 0) uniform sampler2D gbuffer_diffuse;
layout(location = 1) uniform vec4 Ambient;

void main()
{
	vec3 diffuse = texture(gbuffer_diffuse, uvs).rgb;
	outputColor = vec4(Ambient.rgb * diffuse, 1);
}
