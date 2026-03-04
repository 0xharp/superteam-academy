# Course Content for UX Testing

---

## Course 1: Rust Ownership & Memory

### Step 1 — Course Overview

| Field | Value |
|-------|-------|
| **Title** | Rust Ownership & Memory |
| **Course ID** | rust-ownership-memory |
| **Description** | Master Rust's ownership system, borrowing rules, and memory management without a garbage collector. |
| **Long Description** | This course breaks down Rust's most unique feature — its ownership model. You'll learn how the compiler enforces memory safety at zero runtime cost, understand move semantics vs. borrowing, and practice writing code that compiles on the first try. Ideal for developers coming from JavaScript, Python, or Go who want to build Solana programs. |
| **Difficulty** | beginner |
| **Track** | Solana Core |
| **Tags** | rust, memory, ownership, beginner |

**On-Chain Parameters**

| Field | Value |
|-------|-------|
| **XP Per Lesson** | 30 |
| **Track Level** | 1 |
| **Creator Reward XP** | 50 |
| **Min Completions for Reward** | 5 |

---

### Step 2 — Modules & Lessons

#### Module 1: Ownership Fundamentals

**Description:** Understand how Rust manages memory through ownership, moves, and scope.

##### Lesson 1.1 — "How Ownership Works" (Content, 20 min)

**Markdown Content:**

```
## Ownership in Rust

Every value in Rust has exactly one owner. When the owner goes out of scope, the value is dropped.

### The Three Rules

1. Each value has a single **owner variable**
2. There can only be **one owner at a time**
3. When the owner goes out of scope, the value is **dropped**

### Move Semantics

```rust
let s1 = String::from("hello");
let s2 = s1; // s1 is MOVED into s2
// println!("{s1}"); // ERROR: s1 is no longer valid
println!("{s2}"); // OK
```

Unlike garbage-collected languages, Rust doesn't copy heap data by default. Assignment **moves** ownership.

### Stack vs. Heap

- **Stack types** (`i32`, `bool`, `f64`) implement `Copy` — assignment copies the bits
- **Heap types** (`String`, `Vec<T>`) are **moved** — only the pointer is copied, original is invalidated

### The `Clone` Trait

To explicitly duplicate heap data:

```rust
let s1 = String::from("hello");
let s2 = s1.clone(); // deep copy
println!("{s1} {s2}"); // both valid
```

### Why This Matters for Solana

Solana programs are written in Rust. Understanding ownership prevents common bugs like use-after-free and double-free — without needing a garbage collector eating into your compute units.
```

---

#### Module 2: Borrowing & Lifetimes

**Description:** Learn how references let you use values without taking ownership, and how lifetimes keep references valid.

##### Lesson 2.1 — "References and Borrowing" (Content, 25 min)

**Markdown Content:**

```
## Borrowing

Instead of transferring ownership, you can **borrow** a value using references.

### Immutable References (`&T`)

```rust
fn calculate_length(s: &String) -> usize {
    s.len()
} // s goes out of scope, but since it doesn't own the String, nothing is dropped

let s1 = String::from("hello");
let len = calculate_length(&s1);
println!("{s1} has length {len}"); // s1 is still valid
```

You can have **multiple immutable references** at the same time.

### Mutable References (`&mut T`)

```rust
fn push_world(s: &mut String) {
    s.push_str(" world");
}

let mut s = String::from("hello");
push_world(&mut s);
println!("{s}"); // "hello world"
```

### The Borrowing Rules

1. You can have **either** many `&T` **or** one `&mut T` — never both at the same time
2. References must always be **valid** (no dangling pointers)

This is how Rust prevents data races at compile time — no runtime locks needed.

### Slices: Borrowed Views

```rust
let s = String::from("hello world");
let hello: &str = &s[0..5];
let world: &str = &s[6..11];
println!("{hello} {world}");
```

Slices borrow a portion of data without copying.
```

---

##### Lesson 2.2 — "Ownership Challenge" (Challenge, 20 min)

**Challenge Prompt:**

```
Write a function `longest` that takes two string slices and returns the longer one. If they are equal length, return the first. The function must use proper lifetime annotations.
```

**Language:** rust

**Starter Code:**

```rust
// Add the correct lifetime annotations and implement the function
fn longest(a: &str, b: &str) -> &str {
    // Your code here
    todo!()
}
```

**Solution:**

```rust
fn longest<'a>(a: &'a str, b: &'a str) -> &'a str {
    if a.len() >= b.len() {
        a
    } else {
        b
    }
}
```

**Test Cases:**

| Label | Input | Expected Output |
|-------|-------|-----------------|
| Returns longer string | hello, hi | hello |
| Returns first when equal length | abc, xyz | abc |
| Works with empty string | rust, (empty) | rust |

**Hints:**

1. The return type borrows from the inputs — you need a lifetime parameter `'a`
2. Add `<'a>` after `fn longest` and annotate both parameters and the return type with `'a`
3. Use `.len()` to compare lengths

---
---

## Course 2: Rust Error Handling

### Step 1 — Course Overview

| Field | Value |
|-------|-------|
| **Title** | Rust Error Handling Patterns |
| **Course ID** | rust-error-handling |
| **Description** | Learn idiomatic Rust error handling with Result, Option, and the ? operator for writing robust Solana programs. |
| **Long Description** | Rust doesn't have exceptions — it uses Result and Option types to make error handling explicit and type-safe. This course teaches you how to propagate errors cleanly, create custom error types, and apply these patterns in Solana program development where proper error handling is critical for security. |
| **Difficulty** | intermediate |
| **Track** | Solana Core |
| **Tags** | rust, errors, result, intermediate |

**On-Chain Parameters**

| Field | Value |
|-------|-------|
| **XP Per Lesson** | 35 |
| **Track Level** | 1 |
| **Creator Reward XP** | 60 |
| **Min Completions for Reward** | 5 |
| **Prerequisite Course ID** | rust-ownership-memory |

---

### Step 2 — Modules & Lessons

#### Module 1: Result and Option

**Description:** Understand Rust's two core types for representing the absence of a value or a computation that can fail.

##### Lesson 1.1 — "Option and Result Types" (Content, 25 min)

**Markdown Content:**

```
## No Null, No Exceptions

Rust doesn't have `null` or exceptions. Instead it uses two enums:

### Option<T> — Maybe a Value

```rust
enum Option<T> {
    Some(T),
    None,
}
```

Use when a value might not exist:

```rust
fn find_user(id: u64) -> Option<String> {
    if id == 1 {
        Some(String::from("Alice"))
    } else {
        None
    }
}

match find_user(1) {
    Some(name) => println!("Found: {name}"),
    None => println!("Not found"),
}
```

### Result<T, E> — Success or Failure

```rust
enum Result<T, E> {
    Ok(T),
    Err(E),
}
```

Use when an operation can fail:

```rust
use std::num::ParseIntError;

fn parse_age(input: &str) -> Result<u8, ParseIntError> {
    input.parse::<u8>()
}
```

### The ? Operator

Propagate errors without verbose match blocks:

```rust
fn get_user_age(input: &str) -> Result<u8, ParseIntError> {
    let age = input.parse::<u8>()?; // returns Err early if parse fails
    Ok(age)
}
```

### Useful Combinators

```rust
// Option
let name = find_user(1).unwrap_or(String::from("Unknown"));
let upper = find_user(1).map(|n| n.to_uppercase());

// Result
let age = parse_age("25").unwrap_or(0);
let doubled = parse_age("25").map(|a| a * 2);
```

### Why This Matters for Solana

Anchor programs return `Result<()>`. Every instruction handler uses `?` to propagate errors. Understanding this pattern is essential.
```

---

#### Module 2: Custom Errors in Practice

**Description:** Build custom error types and apply error handling patterns used in real Solana programs.

##### Lesson 2.1 — "Custom Error Types" (Content, 20 min)

**Markdown Content:**

```
## Custom Error Types

Real programs need domain-specific errors.

### Using thiserror

```rust
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("User not found: {0}")]
    UserNotFound(u64),

    #[error("Insufficient balance: need {needed}, have {available}")]
    InsufficientBalance { needed: u64, available: u64 },

    #[error("Parse error")]
    ParseError(#[from] std::num::ParseIntError),
}
```

The `#[from]` attribute auto-implements `From`, letting `?` convert automatically.

### Anchor Error Codes

In Solana Anchor programs, errors work similarly:

```rust
#[error_code]
pub enum ErrorCode {
    #[msg("Course is not active")]
    CourseNotActive,

    #[msg("Already enrolled in this course")]
    AlreadyEnrolled,

    #[msg("Insufficient XP balance")]
    InsufficientXP,
}
```

Use with `require!`:

```rust
require!(course.is_active, ErrorCode::CourseNotActive);
require!(!enrollment.completed, ErrorCode::AlreadyEnrolled);
```

### Pattern: Mapping External Errors

```rust
fn fetch_data(url: &str) -> Result<Data, AppError> {
    let response = reqwest::get(url)
        .map_err(|e| AppError::NetworkError(e.to_string()))?;
    let data = response.json()
        .map_err(|e| AppError::ParseError(e.to_string()))?;
    Ok(data)
}
```
```

---

##### Lesson 2.2 — "Error Handling Challenge" (Challenge, 20 min)

**Challenge Prompt:**

```
Write a function `divide` that takes two u64 values and returns a Result. It should return an error string if the divisor is zero, otherwise return the quotient.
```

**Language:** rust

**Starter Code:**

```rust
fn divide(a: u64, b: u64) -> Result<u64, String> {
    // Your code here
    todo!()
}
```

**Solution:**

```rust
fn divide(a: u64, b: u64) -> Result<u64, String> {
    if b == 0 {
        Err(String::from("division by zero"))
    } else {
        Ok(a / b)
    }
}
```

**Test Cases:**

| Label | Input | Expected Output | Validator |
|-------|-------|-----------------|-----------|
| Divides correctly | 10, 2 | 5 | `Number(output) === 5` |
| Returns error on zero divisor | 10, 0 | division by zero | `output.includes("division by zero")` |
| Integer division truncates | 7, 2 | 3 | `Number(output) === 3` |

**Hints:**

1. Check if `b == 0` first and return `Err(...)` with a message
2. Otherwise return `Ok(a / b)`
3. Use `String::from(...)` to create the error string
