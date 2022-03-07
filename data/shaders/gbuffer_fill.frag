#version 430

layout (location =  0) out vec4 FragPosSpec;
layout (location =  1) out vec4 NormalShinny;
layout (location =  2) out vec4 Diffuse;

in vec2 uvs;
in vec3 mNormal;
in vec3 mFragPos;

layout (location =  3) uniform bool			mat_use_alpha_cutoff;
layout (location =  4) uniform float		mat_alpha_cutoff_value;

layout (location =  7) uniform vec4			mat_diffuse_color;
layout (location =  8) uniform sampler2D 	mat_diffuse_sampler;
layout (location =  9) uniform sampler2D 	mat_normal_sampler;
layout (location = 10) uniform sampler2D 	mat_spec_shiny_sampler;

void main()
{
	// Store the color value for the diffuse (and spec/shinny) since they will be used in 2 places
	vec4 diffuse_from_texture = texture(mat_diffuse_sampler, uvs);
	vec3 spec_shiny = vec3(texture(mat_spec_shiny_sampler, uvs));

	// Check if the pixel should be discarded
	if (mat_use_alpha_cutoff && mat_alpha_cutoff_value > diffuse_from_texture.a)
		discard;

	// Store the values in the GBuffer
	FragPosSpec		= vec4(mFragPos, spec_shiny.b);
	NormalShinny	= vec4(normalize(mNormal), max(0.01, spec_shiny.g));
	Diffuse			= mat_diffuse_color * diffuse_from_texture;
}
