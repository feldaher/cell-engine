Feature: A shape becomes a tetrahedral mesh
  A body-centred cubic lattice is clipped by the shape's signed distance and its boundary
  nodes are snapped onto the surface. The engine knows the body only as a Shape.

  Scenario: A sphere meshes to its own volume
    Given a sphere of radius 1
    When its simulation mesh is built
    Then the rest volume is within 5 percent of four thirds pi
    And every tetrahedron is positively oriented

  Scenario: Every tetrahedron takes the material at its centroid
    Given a sphere of radius 1 whose upper half is material 3
    When its simulation mesh is built
    Then tetrahedra with centroids above the equator are material 3 and the others material 0

  Scenario: A cut plane clips the mesh
    Given a sphere of radius 1 cut by the plane x = 0
    When its simulation mesh is built
    Then no particle lies beyond the plane
    And the rest volume is within 6 percent of half the sphere

  Scenario: The skin is a closed surface facing outward
    Given a sphere of radius 1
    When its piece is built
    Then every edge of the skin is shared by exactly two triangles
    And the skin normals point away from the centre
