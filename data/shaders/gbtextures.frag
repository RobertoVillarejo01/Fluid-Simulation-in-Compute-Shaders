#version 430

out vec4 outputColor;
in  vec2 uvs;

layout(location = 0) uniform uint mode;
layout(location = 1) uniform sampler2D gbuffer_pos_spec;
layout(location = 2) uniform sampler2D gbuffer_normal_shinny;
layout(location = 3) uniform sampler2D gbuffer_diffuse;

void main()
{
	vec4 pos_spec		= texture(gbuffer_pos_spec, uvs);
	vec4 normal_shinny	= texture(gbuffer_normal_shinny, uvs);
	vec4 diffuse		= texture(gbuffer_diffuse, uvs);

	if 		(mode == 1) outputColor = vec4(pos_spec.rgb, 			1.0f);		// Position
	else if (mode == 2) outputColor = vec4(normal_shinny.rgb, 		1.0f);		// Normals
	else if (mode == 3) outputColor = vec4(vec3(pos_spec.a), 		1.0f);		// Specular
	else if (mode == 4) outputColor = vec4(vec3(normal_shinny.a), 	1.0f);		// Shinniness
	else if (mode == 5) outputColor = vec4(diffuse.rgb, 			1.0f);		// Diffuse
	else outputColor = vec4(1, 0,0,1);
}
