Feature: Species diffuse over a surface
  The same P1 finite elements, lumped mass and backward Euler as in the volume, but on a
  triangulated surface, where the operator is the Laplace-Beltrami one. This is what Breath's
  virions and interferon live on.

  Scenario: The lumped mass is the surface area
    Given a flat square sheet of side 10
    Then the total lumped mass is the area of the sheet
    And every row of the stiffness matrix sums to zero

  Scenario: Diffusion without decay conserves the total amount
    Given a flat square sheet of side 10 with a pulse in one corner
    When it diffuses for many steps without decay
    Then the total amount is unchanged
    And the concentration has spread toward uniform

  Scenario: Decay without diffusion follows an exponential
    Given a flat square sheet of side 10 with a uniform species
    When it decays for 10 minutes without diffusing
    Then every node has fallen by exp minus k t

  Scenario: A gradient on a strip decays with length sqrt(D over k)
    Given a long flat strip
    When a species is held at one end and reaches steady state
    Then the concentration decays exponentially with length sqrt(D/k) within 5 percent

  Scenario: Stretching the surface dilutes without creating or destroying
    Given a flat square sheet of side 10 with a uniform species
    When the sheet is stretched to 1.5 times its area
    Then the total amount is unchanged
    And the concentration has fallen by a factor 1.5

  Scenario: Diffusion on a sphere reaches a uniform steady state
    Given the boundary surface of a sphere of radius 1 with a pulse at the north pole
    When it diffuses for a long time without decay
    Then the concentration is uniform within 1 percent
    And the total amount is unchanged
