# GPU Fluid Simulation using Compute Shaders

## Preview

![This is a alt text.](/docs/FluidStart.gif "Fluid expand")
![This is a alt text.](/docs/MovingContainer1.gif "Move sideways")
![This is a alt text.](/docs/MovingContainer2.gif "Move all around")
![This is a alt text.](/docs/ShakeUpAndDown.gif "Shake up and down")

## Summary

Program built in a C++ Engine from scratch using SDL2, glew, OpenGL, glm and ImGui to name a few.  
The physics in the project are following mainly the work in Position Based Fluids. However, I also needed to check some of the predecesor papers: 

>1. Macklin, M., & Müller, M. (2013). Position based fluids. ACM Transactions on Graphics (TOG), 32(4), 1-12.
>1. Müller, M., Charypar, D., & Gross, M. (2003, July). Particle-based fluid simulation for interactive applications. In Proceedings of the 2003 ACM SIGGRAPH/Eurographics symposium on Computer animation (pp. 154-159).
>1. Monaghan, J. J. (1992). Smoothed particle hydrodynamics. Annual review of astronomy and astrophysics, 30(1), 543-574.

The details of the implementation were mostly home-brew so I cannot link a specific page to check the ideas. However, some of the key points that may be found interesting:

- The formulas that come from the original SPH (Smoothed particle hydrodynamics) help avoid checking all particles against all others. Instad, each particle should only check against particles in a radius.
- The particles may be sorted every frame in a uniform grid, based on their location.
- We should check collisions between particles within a cell and against the neighbouring 26 cells.
- We can benefit from the GPU parallelism when:
  - Updating the position of particles & Computing their cell
  - Reordering particle buffers to have particles within a cell contiguous in memory (Check atomicAdd in shaders)
  - Applying the physic equations to all particles

<br>

## Rendering particles

Instead of rendering particles, in this project I'm rendering quads. A single position is needed to render each quad, so its easy to do so in an instanced way. (Check the IMPORTANT line)

**1. Instanced Rendering**

```
glm::mat4 World2View = mCamera.GetWorldToView();
glm::mat4 World2Proj = mCamera.GetCamToPerspective() * World2View;

mShaders[eShader::BasicFluidRender].Bind();  
glBindFramebuffer(GL_FRAMEBUFFER, 0);
glClear(GL_DEPTH_BUFFER_BIT);  

// IMPORTANT //
// Compute shaders act on memory within the FluidMesh //
glBindVertexArray(mFluidMesh[0]); 

glUniformMatrix4fv(0, 1, GL_FALSE, &World2Proj[0][0]);
glUniformMatrix4fv(1, 1, GL_FALSE, &World2View[0][0]);
glUniform1f(2, mParticleRadius);
glDrawArraysInstanced(GL_TRIANGLES, 0, 6, mParticleCount);
```
![This is a alt text.](/docs/RenderingBasic.png "Final Result")

**2. Billboarding**

```
// Extract the necessary vectors from the camera mtx
vec3 CamRightVec = normalize(vec3(World2View[0][0], World2View[1][0], World2View[2][0]));
vec3 CamUpVec    = normalize(vec3(World2View[0][1], World2View[1][1], World2View[2][1]));
  
// Get the final rotated version of the model space vtx andscale it appropiately
vec3 Rotated = (CamRightVec * aPos.x + CamUpVec * aPos.y) * mScale;
 
// Finally apply world to proj transforms to the rotated model
gl_Position = World2Proj * vec4(Rotated + iPos, 1.0);
```
![This is a alt text.](/docs/RenderingIntermediate.png "Final Result")

**3. Radius check**

Vertex shader:
```
layout (location = 0) in vec3 aPos;    // [-0.5, 0.5]
out vec2 uvs;

void main()
{
  ...
  uvs = 2*aPos.xy;
}
```

Fragment shader:
```
float r2 = dot(uvs, uvs);
if (r2 > 1.0) discard;
```
![This is a alt text.](/docs/RenderingLast.png "Final Result")

<br>

## Controls

<pre>
AWSDQE             = Move camera Following Forward, Right or World's Up Vector
Right Mouse click  = Rotate
Up/Down/Left/Right = Rotate too (Around Pitch and Yaw)
F5                 = Refresh shaders
Ctrl+R             = Reset Scene (Delete objects and creates them again)
</pre>
