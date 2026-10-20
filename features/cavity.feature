Feature: An enclosed volume can be held to a target
  A closed, outward-wound triangle surface over the simulation particles encloses a volume
  (the divergence theorem). Holding it to a target is what makes a hollow body breathe, and the
  constraint's Lagrange multiplier is the pressure it exerts.

  Scenario: The enclosed volume of a known shape is exact
    Given the boundary surface of a unit cube
    Then the enclosed volume is 1
    And it is unchanged when the cube is moved far from the origin

  Scenario: The boundary of a tet mesh is closed
    Given a sphere mesh of radius 1
    When its boundary faces are taken
    Then every edge is shared by exactly two faces
    And the enclosed volume is within 5 percent of four thirds pi

  Scenario: The gradient of the volume is the area-weighted normal
    Given a sphere mesh of radius 1
    Then moving every boundary particle a little along the volume gradient changes the volume as predicted

  Scenario: A cavity driven to a larger target inflates to it
    Given a hollow sphere whose cavity is held to its own volume
    When the target is raised by 10 percent and it settles
    Then the enclosed volume is within 1 percent of the target
    And the cavity pressure is positive

  Scenario: A cavity driven to a smaller target deflates and pulls inward
    Given a hollow sphere whose cavity is held to its own volume
    When the target is lowered by 10 percent and it settles
    Then the enclosed volume is within 1 percent of the target
    And the cavity pressure is negative
