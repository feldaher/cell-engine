Feature: Bodies wobble like gelatin
  XPBD with co-rotational tetrahedra and a volume constraint, a floor with friction, and damping
  of relative motion only.

  Scenario: A body left on the floor comes to rest
    Given a sphere resting on the floor
    When two seconds are simulated
    Then the kinetic energy is almost zero
    And the volume is within 2 percent of rest

  Scenario: Damping does not slow a falling body
    Given a sphere high above the floor
    When a tenth of a second is simulated with syrupy damping
    Then the centre of mass has accelerated at g

  Scenario: A smaller rest volume shrinks the body
    Given a sphere resting on the floor
    When its rest volume is set to 70 percent and it settles
    Then its volume is within 3 percent of 70 percent of the original

  Scenario: Extra solid-contact passes leave a single body unchanged
    Given two identical spheres resting on the floor
    When one is simulated with one solid-contact pass and the other with two
    Then they end in the same place
