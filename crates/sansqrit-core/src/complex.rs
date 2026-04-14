//! Complex number utilities for quantum state amplitudes.

use num_complex::Complex64;

/// Type alias for quantum amplitudes.
pub type Amplitude = Complex64;

/// Convenience constructors.
pub fn c(re: f64, im: f64) -> Amplitude {
    Complex64::new(re, im)
}

pub fn c_real(re: f64) -> Amplitude {
    Complex64::new(re, 0.0)
}

pub fn c_imag(im: f64) -> Amplitude {
    Complex64::new(0.0, im)
}

pub fn c_zero() -> Amplitude {
    Complex64::new(0.0, 0.0)
}

pub fn c_one() -> Amplitude {
    Complex64::new(1.0, 0.0)
}

/// Euler formula: e^(i*theta) = cos(theta) + i*sin(theta)
pub fn c_exp_i(theta: f64) -> Amplitude {
    Complex64::new(theta.cos(), theta.sin())
}

/// Probability from amplitude: |a|^2
pub fn probability(a: Amplitude) -> f64 {
    a.norm_sqr()
}

/// Check if two amplitudes are approximately equal.
pub fn approx_eq(a: Amplitude, b: Amplitude, tol: f64) -> bool {
    (a - b).norm() < tol
}

/// 1/sqrt(2) — used constantly in quantum gates.
pub const FRAC_1_SQRT2: f64 = std::f64::consts::FRAC_1_SQRT_2;

/// Display complex number in bra-ket friendly format.
pub fn fmt_amplitude(a: Amplitude) -> String {
    if a.im.abs() < 1e-15 {
        format!("{:.6}", a.re)
    } else if a.re.abs() < 1e-15 {
        format!("{:.6}i", a.im)
    } else {
        format!("{:.6}{:+.6}i", a.re, a.im)
    }
}

/// Serializable complex pair for lookup tables (bytemuck compatible).
#[derive(Clone, Copy, Debug)]
#[repr(C)]
pub struct ComplexPair {
    pub re: f64,
    pub im: f64,
}

unsafe impl bytemuck::Pod for ComplexPair {}
unsafe impl bytemuck::Zeroable for ComplexPair {}

impl From<ComplexPair> for Amplitude {
    fn from(p: ComplexPair) -> Self {
        Complex64::new(p.re, p.im)
    }
}

impl From<Amplitude> for ComplexPair {
    fn from(a: Amplitude) -> Self {
        ComplexPair { re: a.re, im: a.im }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_euler_formula() {
        let theta = std::f64::consts::PI / 4.0;
        let a = c_exp_i(theta);
        assert!((a.re - theta.cos()).abs() < 1e-15);
        assert!((a.im - theta.sin()).abs() < 1e-15);
    }

    #[test]
    fn test_probability() {
        let a = c(FRAC_1_SQRT2, 0.0);
        assert!((probability(a) - 0.5).abs() < 1e-15);
    }
}
