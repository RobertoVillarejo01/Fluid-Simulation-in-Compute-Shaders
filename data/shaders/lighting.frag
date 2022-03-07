#version 430

// Structs
struct MaterialParameters
{
  vec3  ambient;    
  vec3  diffuse;    
  vec3  specular;   
  float shininess;  
};

struct LightSourceParameters
{
  // Basic properties 
  int   light_type;
  vec3  position;
  float radius;
  
  // Light intensities
  vec3  ambient;
  vec3  diffuse;
  vec3  specular;
};

// DATA (This should be done through glUniform etc.)
const float PI = 3.141592;
const vec3 CamPos = vec3(0, 0, 0);
MaterialParameters material;

// Inputs / Outputs
out vec4 outputColor;

// GBUFFER
layout(location = 1) uniform sampler2D gbuffer_pos_spec;
layout(location = 2) uniform sampler2D gbuffer_normal_shinny;
layout(location = 3) uniform sampler2D gbuffer_diffuse;
layout(location = 4) uniform LightSourceParameters light;

// From GBuffer for lighting computations
vec3 mFragPos;
vec3 mNormal;

void main()
{
	vec2 uvs = gl_FragCoord.xy / textureSize(gbuffer_diffuse, 0);

	vec4 pos_spec		= texture(gbuffer_pos_spec, uvs);
	vec4 normal_shinny	= texture(gbuffer_normal_shinny, uvs);
	vec4 diffuse		= texture(gbuffer_diffuse, uvs);

	material.ambient = vec3(0);
	material.diffuse = diffuse.rgb;
	material.specular = vec3(pos_spec.a);
	material.shininess = normal_shinny.a;

	mFragPos = pos_spec.rgb;
	mNormal = normal_shinny.rgb;
	
	// This normal is expected to be normalized (and it should be since it is being stored normalized to the GBuffer)
	vec3 N = mNormal;	
	vec3 L = normalize(light.position - mFragPos);
	
	// Specular
	vec3 V = normalize(CamPos - mFragPos);
	vec3 R = 2 * dot(N, L) * N - L; 
	float specFactor = pow ( max( dot(R, V), 0 ), material.shininess);

	// Different light totals
	vec3 ambientTotal = material.ambient * light.ambient;
	vec3 diffuseTotal = material.diffuse * light.diffuse * max( dot(N, L), 0 );
	vec3 specularTotal = material.specular * light.specular * specFactor;
	
	// Point Light's (Attenuation)
	float dist = length(light.position - mFragPos);
	float attenuationFactor = max(0, light.radius - dist) / light.radius;

	// Result / Addition
	outputColor = vec4((ambientTotal + diffuseTotal + specularTotal) * attenuationFactor, 1);
	//outputColor = vec4(material.diffuse, 1);
}
