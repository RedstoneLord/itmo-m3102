# Autumn LiveCoding: C++ techniques for independent practice

## Scope and how to study

This guide covers the building blocks for the two autumn exercises: **frequent words** and **Wordle**. It starts with class syntax and memory ownership, then connects C strings, records, command-line arguments, file input, word recognition, counting, and interactive input.

Read the explanations, trace the examples, and implement the exercises yourself. Code blocks labelled **complete example** can be compiled independently. Other blocks are declarations or fragments intended to illustrate one operation. The final programs and the complete vector implementation are exercises.

| Task | What to prepare |
|---|---|
| Frequent words, autumn 2024 | Named options `--input PATH` and `--top N`; case-insensitive counting; selecting the top N words; one word per output line |
| Wordle, autumn 2025 | Positional arguments `PATH N`; one pass through a dictionary; random selection by length; six valid attempts; character comparisons and game state |

Both exercises prohibit standard containers, `std::string`, and `std::string_view`. These restrictions do not prohibit the entire standard library: functions from headers such as `<cstdio>`, `<cstring>`, and `<cstdlib>` are useful here. Use the exact restrictions attached to the task you receive.

Task statements: [frequent words](https://is-itmo-c-26.github.io/lectures/livecoding/2024-autumn.html), [Wordle](https://is-itmo-c-26.github.io/lectures/livecoding/2025-autumn.html).

The examples below treat text as **single-byte characters**, such as ASCII letters. A byte is not necessarily a Unicode character. UTF-8 Russian text requires separate decisions about character boundaries, word lengths, and case conversion.

## 1. Arrays, pointers, references, and const

### Arrays and pointers

```cpp
int values[3] = {10, 20, 30};
int* pointer = values;

pointer[1] = 99; // values[1] is now 99
```

`values` is an array that contains three integers. `pointer` is a separate variable containing the address of the first integer. No second array is created.

| Expression | Meaning |
|---|---|
| `&values[0]` | Address of the first element |
| `*pointer` | The element at the address in `pointer` |
| `pointer[i]` | Element at offset `i` from that address |
| `pointer + 1` | Address of the next integer, not the next byte |
| `nullptr` | A pointer value that points to no object |

For an array with three elements, valid indices are `0`, `1`, and `2`. An address immediately after an array may be formed for traversal, but you must not read or write an element through it.

### References and parameter passing

```cpp
int number = 5;
int& alias = number;
alias = 8; // changes number
```

A reference is another name for an existing object. It must be initialized and cannot later be made to refer to a different object. Assigning through it changes the original object.

```cpp
void inspect(const int& value); // reads the original
void modify(int& value);        // can change the original
void receiveCopy(int value);    // receives a separate integer
```

For small integers, passing by value is usually appropriate. For records and owning classes, references can avoid copying and express whether modification is allowed.

### Where const applies

```cpp
const int* readable = &number; // cannot change number through readable
int* const fixed = &number;    // cannot change the address in fixed
```

The first pointer can be redirected; the second can modify its pointed-to integer. `const int* const` combines both restrictions.

### sizeof and array parameters

```cpp
char text[] = "hello";
char* p = text;

// sizeof(text) is 6, including the terminating zero.
// sizeof(p) is the size of a pointer, not the string length.
```

In an ordinary function parameter, `char buffer[]` is adjusted to `char* buffer`. The function does not automatically know the original array capacity:

```cpp
void fill(char* buffer, std::size_t capacity);
```

`std::size_t`, available from `<cstddef>`, is the unsigned type used for sizes. Be careful when mixing it with signed integers: subtracting one from unsigned zero wraps to a large value.

:::warning
A pointer or reference is usable only while its target remains alive. Do not return the address of a local variable. Do not retain pointers into an allocation after deleting or replacing it.
:::

**Practice:** write a function that swaps two integers through references. Then write a function that fills a caller-provided array, receiving its capacity separately.

```quiz
title: Check: arrays and references

? After `int a = 3; int& b = a; b = 9;`, what is the value of `a`? Enter an integer.
= 9
explain: The reference names the same integer, so assignment through b changes a.

? A function receives `char* buffer`. What does `sizeof(buffer)` measure?
- [ ] The number of characters before the terminating zero
- [x] The size of the pointer variable's type
- [ ] The capacity of the caller's array
explain: The array size is not carried by an ordinary pointer parameter.

? Which operations are valid for `const int* p` pointing to a live integer?
- [x] Read the integer through p
- [x] Assign p the address of another integer
- [ ] Assign a new integer value through p
- [ ] Delete the target regardless of who owns it
explain: Const restricts modification through this pointer. It neither fixes the pointer's address nor establishes ownership.
```

## 2. Writing a class and its member functions

### Fields and access

A class declares the state each object stores and the operations available on it. Members below an access label keep that access until another label appears.

| Label | Access |
|---|---|
| `private` | Members and friends of the class |
| `protected` | Also accessible in derived classes, subject to inheritance rules |
| `public` | Accessible to code using the object |

For a vector, keep the pointer, length, and capacity private. Make supported operations public. Inheritance and `protected` are unnecessary for these exercises. A `struct` is like a `class`, but its default member access is public instead of private.

### Complete example: a small class

```cpp
#include <cstdio>

class Counter {
private:
    int value_;

public:
    Counter() : value_(0) {}
    explicit Counter(int initial) : value_(initial) {}

    ~Counter() = default;

    int value() const {
        return value_;
    }

    void add(int amount) {
        value_ += amount;
    }
};

int main() {
    Counter counter(4);
    counter.add(3);
    std::printf("%d\n", counter.value());
}
```

An ordinary method has a return type, a name, parameters, and a body. `void` means it returns no value. Call it on an object using `.`, or through a pointer using `->`.

### Constructors, initialization, and destruction

A constructor has the class's name and no return type. The member initializer list after `:` initializes fields before the body runs. Fields initialize in their declaration order, regardless of the order written in that list.

`explicit` on a one-argument constructor prevents unintended implicit conversions to your class. It still permits direct construction such as `Counter c(4);`.

The destructor is named `~Counter`, takes no parameters, and has no return type. It runs when an object's lifetime ends. `= default` requests compiler-generated behavior; this counter needs no custom cleanup. An owning vector needs a destructor that releases its allocation.

### Definitions inside and outside

A declaration belongs inside the class. Its definition may also be inside, or may be written outside with the class name:

```cpp
class Meter {
private:
    int reading_;

public:
    explicit Meter(int reading);
    int reading() const;
};

Meter::Meter(int reading) : reading_(reading) {}

int Meter::reading() const {
    return reading_;
}
```

For ordinary non-template classes, declarations commonly go in `.h` files and outside definitions in `.cpp` files. A header normally needs an include guard or `#pragma once`. Finish the class definition with `;`.

### this and const methods

Inside a non-static method, `this` points to the current object. Write `this->reading_`, or simply `reading_`. `*this` means the object itself. `this.reading_` is invalid because `this` is a pointer.

Trailing `const` declares an inspecting method:

```cpp
int reading() const;
```

It can be called on a const object and cannot modify ordinary fields through `this`. A pointer member introduces an important limit: making the containing object const does not automatically make the pointed-to allocation const. Your methods must maintain that promise themselves.

**Practice:** write a class with one private integer, two constructors, an inspecting method, and a modifying method. Define one method outside the class.

```quiz
title: Check: class syntax

? Which declaration describes an inspecting method that returns an integer?
- [ ] `void size() const;`
- [ ] `int const size();`
- [x] `int size() const;`
explain: The trailing const qualifies the object used by the member function. The return type is int.

? Inside a non-static member function, which expressions refer to the current object's field `value_`?
- [x] `value_`
- [x] `this->value_`
- [ ] `this.value_`
- [ ] `this[value_]`
explain: This is a pointer to the current object. An unqualified field name also accesses that object's field.
```

## 3. Dynamic memory and your own vector

### Allocation and ownership

```cpp
int* single = new int(7);
delete single;

int* array = new int[20];
delete[] array;
```

Match `new` with `delete`, and `new[]` with `delete[]`. Do not mix these with `malloc` and `free`. An allocation must have a clear owner responsible for releasing it exactly once.

`new int[20]` leaves the integers uninitialized. `new int[20]{}` initializes them to zero. Deleting a null pointer is safe; deleting an already freed allocation is not. Deletion does not automatically set a pointer variable to `nullptr`.

### State and invariants

Your integer vector needs a pointer, a length, and a capacity:

```cpp
int* arr_;
int len_;
int cap_;
```

Maintain:

$$
0 \leq \text{len} \leq \text{cap}.
$$

The first `len_` slots contain the vector's logical elements. The remaining slots are capacity for future additions. A convenient default state is `nullptr`, `0`, `0`.

```array
title: Length and capacity
caption: Three elements occupy indices 0 through 2; the highlighted index 3 is the next free slot.
[10, 20, 30, "unused", "unused"] highlight: 3 sorted: 0,1,2
```

### Decide the interface before implementing it

This is an interface sketch, not a complete implementation:

```cpp
class Vector {
private:
    int* arr_;
    int len_;
    int cap_;

public:
    Vector();
    explicit Vector(int capacity);
    Vector(int count, int initial);
    ~Vector();

    Vector(const Vector& from);
    Vector& operator=(const Vector& from);

    int size() const;
    int capacity() const;
    int& operator[](int index);
    const int& operator[](int index) const;

    void reserve(int requested);
    void push_back(int value);
    int pop_back();
    void clear();
};
```

In this design, the one-argument constructor reserves space but starts empty. The two-argument constructor creates `count` elements. This is your chosen interface: `std::vector<int>(count)` instead creates that many elements.

The first `operator[]` returns a reference, allowing `v[0] = 42;`. Its const overload returns a reference through which callers cannot change the element. Unchecked indexing requires the caller to supply a valid element index. A separate `at()` method could check the index and report an error.

### Copy construction and copy assignment

```cpp
Vector a(3, 7);
Vector b = a; // copy construction: b is created
Vector c(a); // also copy construction
b = a;       // copy assignment: b already exists
```

Passing an existing vector to a function by value can also copy it. Passing `const Vector&` provides read access without making a copy.

Copying only `arr_` copies an address. Two owners would then share one allocation and both try to delete it. A deep copy allocates a separate array and copies the first `from.len_` elements. A member of `Vector` can access private fields of another `Vector` object.

The destructor, copy constructor, and copy assignment form the **Rule of Three** for this owning class. In an assignment operator, `return *this;` returns the updated object by reference. A self-assignment check compares `this` with `&from`.

### Allocate before replacing

Use the following sequence both for growing storage and for preparing an independent replacement during assignment:

1. Calculate and validate the replacement capacity in a local variable.
2. Allocate a replacement into a temporary pointer.
3. Copy the live integer elements.
4. Delete the old allocation.
5. Install the replacement pointer and metadata.

:::warning
Ordinary `new[]` reports allocation failure by throwing an exception. If you delete the old array first, `arr_` may still point to freed memory when allocation throws; a later destructor can delete it again. If you change `cap_` first, allocation failure can leave it describing storage you do not have. Preparing replacement state first avoids both problems.
:::

For integers, copying the elements itself does not throw. More general element types require additional lifetime and exception-handling work; that is a later topic.

### Growing and changing length

| Operation | Required behavior |
|---|---|
| `reserve(n)` | Grow only when necessary; preserve length and elements |
| `push_back(x)` | Ensure space, write at `arr_[len_]`, then increase length |
| `pop_back()` | Handle empty input, decrease length, then read the removed integer |
| `clear()` | For this integer vector, set length to zero and retain capacity |
| Destructor | Release the array; resetting fields is unnecessary afterward |

For empty removal, choose a contract. You can require the caller to check `size()` first, or report misuse explicitly. A checked version can use the following statement from `<stdexcept>`:

```cpp
throw std::out_of_range("Vector is empty");
```

Throwing exits the current operation without returning an integer. A caller may handle the exception with `try` and `catch`; otherwise, an unhandled exception terminates the program. A function returning `int` cannot use a bare `return;`, and returning zero as an error is ambiguous because zero could be a real element. This empty-removal contract is separate from allocation failure: preparing replacement storage first protects the existing allocation even when an exception propagates to the caller.

For append growth, choose a positive initial capacity; doubling zero remains zero. Geometric growth, such as doubling, avoids allocating on every insertion. With `int` capacities, check that doubling does not exceed the maximum representable integer before computing it. Reject negative capacities before allocating.

`arr_[len_++]` uses the old length before increasing it. `arr_[--len_]` decreases length first. Trace the indices explicitly before using either expression. `this[index]` indexes the pointer to the vector object, not its internal array; use `arr_[index]` or `(*this)[index]`.

After reallocation, old pointers and references into the array are invalid. Do not retain a reference such as `int& saved = v[0];` across an operation that may grow storage.

:::note
Move construction and move assignment extend the Rule of Three to the Rule of Five. They transfer ownership rather than copying elements. They are useful later, but are not required to implement these autumn exercises. Likewise, a template vector and raw storage with placement construction can wait: `new T[capacity]` constructs every allocated slot and has different requirements from a full `std::vector` implementation.
:::

**Practice:** implement the interface incrementally. Check empty construction, growth from zero, crossing a capacity boundary, independent copying, assignment over an existing allocation, self-assignment, and removal from empty storage. Returning the removed integer is your design choice; `std::vector::pop_back()` returns `void`.

```quiz
title: Check: vector ownership

? A vector has length 3 and capacity 8. At which index should the next appended element be written? Enter an integer.
= 3
explain: Existing elements occupy indices 0 through 2. Length identifies the next free position.

? Which actions belong to deep copy assignment for an owning integer vector?
- [x] Allocate independent replacement storage
- [x] Preserve a valid object if allocation fails
- [ ] Copy only the source pointer
- [ ] Delete the source object's allocation
explain: Each vector must own its own allocation. Prepare the replacement before releasing existing storage.

? Which statement about `arr_[len_--]` is correct?
- [ ] It reads the last live element of a nonempty vector
- [x] It indexes with the old length, then decreases the length
- [ ] It decreases the length before calculating the index
explain: Postfix decrement yields the old value. The last live element is at the old length minus one.
```

## 4. C strings and arrays of word records

### The terminating zero

```cpp
char word[] = "cat"; // {'c', 'a', 't', '\0'}
char buffer[100];   // not yet a valid initialized string
char empty[100]{};  // initially an empty string
```

`'\0'` is the zero character, not the digit `'0'`. A C string containing 100 single-byte letters needs at least 101 slots.

```cpp
char greeting[10];
greeting[0] = 'h';
greeting[1] = 'i';
greeting[2] = '\0';
```

### Library functions

Include `<cstring>`.

| Function or expression | Meaning |
|---|---|
| `std::strlen(s)` | Number of characters before the terminating zero |
| `std::strcmp(a, b) == 0` | The strings have equal contents |
| `std::strcmp(a, b) < 0` | The first string comes before the second in bytewise lexicographic order |
| `std::memcpy(dst, src, n)` | Copy exactly `n` bytes between non-overlapping regions |

`strcmp` returns a negative value, zero, or a positive value; do not require exactly `-1` or `1`. Comparing two pointers with `==` compares their addresses, not string contents.

To create an owned copy of a valid string:

```cpp
std::size_t length = std::strlen(source);
char* copy = new char[length + 1];
std::memcpy(copy, source, length + 1);
// Use copy, then eventually: delete[] copy;
```

The extra byte includes the terminator. The destination must be large enough. `strcpy` also copies the terminator but does not know the destination capacity. `strncpy` is not a universal safe replacement: it may leave the result unterminated. A length check followed by an explicit copy is easier to reason about.

:::warning
String functions search for a terminating zero. Applying `strlen`, `strcmp`, or `%s` output to an unterminated buffer can read outside its allocation. A block returned by `fread` is not automatically a C string.
:::

### Fixed arrays and pointer members

```cpp
struct WordCount {
    char word[1025];
    int count;
};
```

This record directly contains its character array. The size above allows at most 1024 single-byte characters plus the terminator. Record assignment copies the embedded array and the integer. An array of these records can grow using the same ownership ideas as your integer vector, although its elements are now records.

Alternatively:

```cpp
struct OwnedWord {
    char* word;
    int count;
};
```

Here, default copying copies the address. You must decide whether the record owns the pointed-to string and implement the corresponding cleanup and copying policy. A plain pointer member has no automatic ownership behavior.

| Representation | What it stores |
|---|---|
| `char words[20][101]` | Twenty rows, each containing space for a C string |
| `char* words[20]` | Twenty pointers; no word allocations are created by this declaration |
| `WordCount* entries` | An address of records; a separate allocation and used-count are needed |

Saving the address of a reusable read buffer repeatedly saves aliases, not independent words. Copy a word before the buffer is overwritten. Avoid keeping pointers into temporary buffers or records that will be reallocated.

### Case normalization

Include `<cctype>`. For a character already stored in `char`:

```cpp
char lower = static_cast<char>(
    std::tolower(static_cast<unsigned char>(ch))
);
```

Character classification functions such as `std::isalpha` have the same unsigned-character argument requirement. Their behavior depends on the current C locale. This byte-oriented operation handles basic English case conversion; it does not implement Unicode lowercasing for UTF-8.

Normalize consistently before comparing or storing words. Keep punctuation unless the task tells you to strip it: the frequent-words statement specifies separators, not a punctuation-cleaning rule.

**Practice:** write string-length and equality functions manually. Store three independent words, change one, and verify the others. Then compare records containing arrays with records containing pointers.

```quiz
title: Check: C strings and records

? How many array slots are needed for the C string `hello`, including its terminator? Enter an integer.
= 6
explain: Five letters are followed by one zero character.

? What does `std::strcmp(a, b) == 0` establish for valid C strings?
- [x] Their text contents are equal
- [ ] Their starting addresses are equal
- [ ] Their allocated capacities are equal
explain: Strcmp compares characters through the terminating zero, not addresses or capacities.

? A plain struct contains `char* word`. What happens when the struct is copied using its default copy operation?
- [ ] A separate word allocation is created
- [ ] Ownership is automatically transferred
- [x] The pointer value is copied
explain: A pointer member stores an address. Independent ownership requires an explicit design.
```

## 5. Command-line arguments, numbers, and paths

### argc and argv

```cpp
int main(int argc, char* argv[])
```

`argc` counts arguments including the program-name entry in an ordinary invocation. The user arguments occupy `argv[1]` through `argv[argc - 1]`; `argv[argc]` is null.

```bash
./program --input "my text.txt" --top 3
```

This gives five entries: the program name, `--input`, `my text.txt`, `--top`, and `3`. The shell removes the quotes and keeps the path as a single argument.

For named options, compare option names with `strcmp` and check that a value exists before reading `argv[i + 1]`. Decide how to report unknown options, missing required options, and duplicates. For positional arguments, check the expected count and use the documented positions.

### Complete example: checked positive integer conversion

```cpp
#include <cerrno>
#include <climits>
#include <cstdio>
#include <cstdlib>

bool parsePositiveInt(const char* text, int& result) {
    errno = 0;
    char* end = nullptr;
    long value = std::strtol(text, &end, 10);

    if (end == text || *end != '\0' || errno == ERANGE ||
        value <= 0 || value > INT_MAX) {
        return false;
    }

    result = static_cast<int>(value);
    return true;
}

int main(int argc, char* argv[]) {
    int value = 0;
    if (argc != 2 || !parsePositiveInt(argv[1], value)) {
        std::fprintf(stderr, "Expected one positive integer\n");
        return 1;
    }
    std::printf("%d\n", value);
}
```

`end == text` means no digits were converted. A nonzero character at `end` means a suffix remains. `ERANGE` signals a conversion outside the range of `long`; the explicit upper bound also protects conversion to `int`. This helper accepts the leading whitespace and optional plus sign that `strtol` accepts. If a task requires digits only, check that grammar separately. Reference: [strtol](https://en.cppreference.com/cpp/string/byte/strtol).

Unlike `atoi`, this approach can distinguish malformed input from a genuine zero. The accepted range is a policy decision: this helper requires a positive value; it is not a universal rule for every numeric option.

### Filepaths and lifetime

`argv[i]` is already a C string suitable for `fopen`; no filesystem class is required. The argument strings remain available during program execution. Borrow them without deleting them.

An absolute path names a location from the filesystem root. A relative path is interpreted from the program's current working directory, which need not be the directory containing its executable.

**Practice:** print arguments with their indices. Then recognize the two named options in either order and test missing values, an unknown option, `abc`, `12abc`, `0`, a negative value, and an enormous number.

```quiz
title: Check: arguments and numeric conversion

? With `./program --input "my text.txt" --top 3`, how many arguments does argc count? Enter an integer.
= 5
explain: The program-name entry counts, and the quoted path is one argument.

? After strtol, which checks detect malformed or out-of-range numeric input?
- [x] No digits were consumed
- [x] Non-terminating characters remain after the number
- [x] ERANGE was reported
- [ ] The result is smaller than the original string's address
explain: Conversion progress, trailing text, and range errors have separate checks. The application must also enforce its accepted value range.
```

## 6. File input with FILE, fgetc, fgets, and fread

### Opening and closing

Include `<cstdio>` and use the `std::FILE*` returned by `std::fopen`.

| Mode | Effect |
|---|---|
| `"r"` | Open an existing text file for reading |
| `"rb"` | Open an existing file for byte-oriented binary reading |
| `"w"` or `"wb"` | Create or truncate a file for writing |
| `"a"` or `"ab"` | Create if necessary and append output |

Check for `nullptr` before reading. Close every successfully opened file on every exit path. `std::perror("input")` writes an operating-system error description to standard error when an operation reports an error through `errno`.

Binary mode avoids text newline translation on systems that distinguish modes. It does not mean you cannot read text; it means your parser sees the stored bytes. Do not assume every newline is a single byte.

### fgetc: one character at a time

```cpp
int ch;
while ((ch = std::fgetc(file)) != EOF) {
    // Process this character.
}
```

Keep the result in `int` until checking `EOF`. Successful reads return a character converted through `unsigned char` to `int`; `EOF` is a distinct negative macro value, not a portable spelling for a particular integer such as `-1`.

After the loop, inspect `std::ferror(file)` to distinguish an error from normal end-of-file. The stream's end flag is set by a read that encounters the end: do not write `while (!std::feof(file))` as the main reading condition.

Character-at-a-time code is easy to understand and C streams are normally buffered internally. It is a reasonable first implementation; block input lets you process several bytes per library call.

### fgets: a bounded, terminated chunk

```cpp
char line[128];
while (std::fgets(line, sizeof line, file) != nullptr) {
    // Successful input is terminated by '\0'.
}
```

For a buffer of capacity 128, at most 127 characters are stored, followed by a terminator. A newline is retained when read. A long line is split across calls, so a successful call does not necessarily contain a complete line. On failure, do not process stale buffer contents. Reference: [fgets](https://en.cppreference.com/cpp/io/c/fgets).

### fread: an explicit byte count

The arguments are destination, size of one item, number of items requested, and stream. The return value is the number of complete items read. Use an item size of one to make it a byte count.

```cpp
char buffer[4096];
std::size_t count = std::fread(buffer, 1, sizeof buffer, file);
```

Process exactly the first `count` bytes. `fread` neither finds words nor appends `\0`. The final successful read may produce less than the buffer capacity. Reference: [fread](https://en.cppreference.com/cpp/io/c/fread).

### Complete example: count bytes in a file

```cpp
#include <cstdio>

int main(int argc, char* argv[]) {
    if (argc != 2) {
        std::fprintf(stderr, "Usage: byte_count PATH\n");
        return 1;
    }

    std::FILE* file = std::fopen(argv[1], "rb");
    if (file == nullptr) {
        std::perror("input");
        return 1;
    }

    char buffer[4096];
    std::size_t count;
    std::size_t total = 0;
    while ((count = std::fread(buffer, 1, sizeof buffer, file)) > 0) {
        total += count;
    }

    bool failed = std::ferror(file) != 0;
    if (std::fclose(file) != 0) {
        failed = true;
    }
    if (failed) {
        std::fprintf(stderr, "File operation failed\n");
        return 1;
    }

    std::printf("%zu\n", total);
}
```

The buffer is a local array, so it needs no `delete[]`. This example counts bytes, not Unicode characters. Its counter must fit the total file size, as with any finite-size count.

:::warning
Use only the valid portion returned by a read. Neither the file's line-length limit nor your buffer capacity tells you how many bytes the latest read produced. A 1024-character line limit is not a 1024-byte total-file limit.
:::

**Practice:** implement the byte counter using `fgetc`, then using `fread`. Check an empty file and a file whose size is not divisible by the buffer capacity.

```quiz
title: Check: file reading

? `fread(buffer, 1, 128, file)` returns 17. How many bytes may you process from this read? Enter an integer.
= 17
explain: Item size is one byte, so the returned item count is also the byte count.

? Which input function does not append a terminating zero to its destination?
- [ ] fgets on a successful ordinary read
- [x] fread
- [ ] Both always append one
explain: Fread copies raw items and reports their count. Fgets creates a terminated string on successful input.

? Why should the result of fgetc be stored in int before checking it?
- [ ] Every character requires multiple bytes of storage
- [ ] Int automatically converts text to numbers
- [x] The result must distinguish character values from EOF
explain: Check the special result before narrowing it to a character type.
```

## 7. Recognizing words across buffer boundaries

### Reading and parsing are different layers

The reader supplies bytes; the parser decides where words begin and end. A word can cross a read boundary:

```text
read 1: "one ele"
read 2: "phant two"
words:  "one", "elephant", "two"
```

Keep the current word and its length outside the loop that performs reads. Reusing the byte buffer must not erase the unfinished word.

For the frequent-words exercise, spaces separate words within lines, while line endings also end words. In binary mode, treating both `\r` and `\n` as boundaries handles CRLF without producing empty words. Do not silently broaden the task's definition of a word unless you choose and document that policy.

### A small state machine

For each byte:

1. If it is a boundary, finish a nonempty current word and reset its length.
2. Otherwise, validate remaining capacity, normalize case, and append the character.
3. When handing the word to C string functions, append `\0` within the allocation.
4. At normal end-of-file, finish any remaining nonempty word.

```diagram
title: Word recognition
A: round "Receive the next byte"
B: diamond "Is it a word boundary?"
C: diamond "Is the current word nonempty?"
D: box "Finish and store or count the word"
E: box "Reset current length"
F: diamond "Is there space for a character and terminator?"
G: box "Normalize and append"
H: box "Report or handle an oversized word"
I: round "Continue reading"
A -> B
B -> C : yes
C -> D : yes
D -> E
E -> I
C -> I : no
B -> F : no
F -> G : yes
G -> I
F -> H : no
H -> I
```

The oversized-word policy depends on context: for a file promised to obey a maximum, report a violated limit; for an invalid interactive guess, discard the rest of that guess and retry. Never truncate silently and then treat the prefix as a valid complete word.

:::remember
There are two independent events: a read buffer ends, and a word ends. Only actual boundaries or normal end-of-file finish a word.
:::

**Practice:** print normalized words one per line using read buffers of sizes 1, 3, and 4096. All three runs should recognize the same words. Include repeated spaces, blank lines, CRLF, and a last word without a trailing newline.

```quiz
title: Check: word boundaries

? A read ends in `ele` and the next starts with `phant `. What must the parser preserve?
- [ ] The address of the old read buffer only
- [x] The unfinished word and its current length
- [ ] A completed word ele
explain: Read boundaries do not imply word boundaries; the parser must assemble elephant.

? The file ends immediately after the letters in its last word. What should happen on normal end-of-file?
- [x] Finish the remaining nonempty word
- [ ] Discard it because it lacks a trailing space
- [ ] Continue reading until a newline appears
explain: End-of-file can terminate the final word even without a separator byte.
```

## 8. Bounded console input and game state

### Distinguish invalid input from EOF

An invalid guess can be discarded and replaced with another guess. EOF means no more input is available. Retrying forever at EOF creates an infinite loop.

One useful input-function interface is:

```cpp
enum class ReadStatus {
    Ok,
    TooLong,
    EndOfInput,
    Error
};

ReadStatus readLine(std::FILE* input, char* buffer,
                    std::size_t capacity);
```

The function should define its contract: which terminators it removes, whether it accepts a final line without newline, and how it leaves the buffer for each status. Use a capacity of at least two for ordinary `fgets`-based reading.

If an overlong guess fills the buffer, consume the remainder of that same input line before reading another guess. Otherwise, leftover characters become the next guess. Handle the exact-limit case carefully: a full buffer without a newline might contain a valid maximum-length guess whose newline is still waiting. Read enough to distinguish a newline or EOF from an actual extra character.

```cpp
int ch;
while ((ch = std::fgetc(stdin)) != '\n' && ch != EOF) {
    // Discard the remainder of an already rejected line.
}
```

Do not use `fflush(stdin)` to discard input. Standard C/C++ does not define it as a portable input-clearing operation.

### Validate before consuming an attempt

Keep input validation separate from evaluation:

```text
read a complete guess
if input ended: finish the program appropriately
if input failed: report the error
if the guess is invalid: request another guess
normalize a valid guess
evaluate it and consume one attempt
check whether the player won
```

Relevant validation includes length and permitted characters. Do not add dictionary-membership validation unless the task requires it. Check the stated meaning of “invalid input” if the task leaves it ambiguous.

Use a bounded loop or explicit attempt counter and a `bool won`. Invalid guesses should not accidentally consume valid attempts. After a win, stop instead of printing the loss message too.

If you print a prompt without a newline, `std::fflush(stdout)` makes buffered output visible before waiting for input. Pick one input family, such as `<cstdio>`, so you do not need to reason about mixing differently configured stream systems.

**Practice:** read guesses of a fixed length without implementing a game. Check empty input, a valid guess, an oversized line followed by a valid guess, the exact maximum length, and EOF.

```quiz
title: Check: interactive input

? Why must the rest of an oversized guess be consumed before reading another guess?
- [ ] So the file position returns to the beginning
- [x] So its remaining characters do not become the next guess
- [ ] So the buffer allocation becomes larger
explain: Discarding the rejected line restores the boundary between separate attempts.

? Which events should be distinguished by the input layer?
- [x] A complete acceptable-length line
- [x] A rejected oversized line
- [x] End-of-input
- [ ] The next random dictionary index
explain: Input status guides retry and termination decisions independently of game logic.
```

## 9. Random selection and Wordle comparisons

### Seeding and selecting

`std::rand` and `std::srand` are in `<cstdlib>`. `std::time` is in `<ctime>`.

```cpp
std::srand(static_cast<unsigned>(std::time(nullptr)));
```

Seed once near startup, not before every selection. Calls made close together can otherwise restart the same sequence. A fixed seed, such as `std::srand(42);`, is useful when reproducing a bug.

For a small positive candidate count:

```cpp
int index = std::rand() % candidateCount;
```

Check for zero candidates first. Modulo reduction is not generally perfectly uniform; if the candidate count exceeds the generator's possible output range, some candidates cannot be selected by this expression. Understand this limit. Where suitable and allowed, `<random>` offers distributions such as `std::uniform_int_distribution`; it does not require a standard container. Implementing a random-number generator yourself is unnecessary here.

### One pass through the dictionary

An approachable design is to read the dictionary once, store eligible words of the requested length, then select from that stored collection. Growing your collection does not require rereading the file. Handle the case where no eligible words exist before attempting selection.

### Comparing a guess with the target

Separate three operations:

| Question | Operation |
|---|---|
| Does this position match? | Compare two characters at the same index |
| Does the target contain this character? | Search the target's characters |
| Is the entire guess correct? | Compare complete normalized words |

The published autumn task uses `+` for a positional match, `=` for a letter present elsewhere, and `-` for absence. Its example marks the guess `lllll` against `hello` as `==++=`. That example uses presence testing for repeated letters rather than limiting matches to the number of occurrences in the target. Follow the supplied rules and examples. [Wordle examples](https://is-itmo-c-26.github.io/lectures/livecoding/2025-autumn.html)

**Practice:** select from a small manually written list using a fixed seed. Independently write a character-presence helper and test repeated letters before combining it with console input.

```quiz
title: Check: random choice and comparisons

? Before calculating `rand() % candidateCount`, which condition is essential?
- [ ] The count is an even number
- [ ] The count equals the word length
- [x] The count is positive
explain: Taking a remainder with a zero divisor is invalid. Candidate selection also has generator-range and distribution considerations.

? What is the main debugging advantage of a fixed random seed?
- [x] It can reproduce the same pseudo-random sequence in the same implementation
- [ ] It makes every selection a different word
- [ ] It ensures uniform selection for every modulo expression
explain: Repeatability makes failures easier to reproduce; it does not repair biased range reduction.
```

## 10. Searching, counting, and selecting top N

### Linear search first

Store records for distinct normalized words. For each completed word, compare it with the used records. If found, increment that record's count. Otherwise, append a new independent record with count one.

Search only the records actually used, not the whole allocated capacity. Write a helper with a clear “not found” result, such as `-1` when using signed indices. Do not confuse the first record's index, zero, with absence.

If the input has $T$ words, $U$ distinct words, and compared words have length at most $L$, a straightforward linear-search implementation has worst-case time:

$$
O(TUL).
$$

The factor for string comparison matters. A hash table can improve lookup, but is a separate data-structure exercise, not a prerequisite for writing a correct initial program.

### Select records by frequency

Top N means N distinct word records with the largest counts, not only those tied at the overall maximum. Decide what happens when N exceeds the number of distinct words; returning all available distinct words is a reasonable policy if the task gives no other rule. Ties at the selection boundary need an explicit policy when the statement leaves them unspecified.

Two useful approaches are sorting all records by decreasing count, or repeatedly selecting the largest remaining record. The latter is a partial selection sort: each pass places the largest remaining record at the front of the unselected part.

The following visual demonstrates selection using counts only. In the actual program, swap the entire word-count record so that its text stays attached to its count.

```array
title: Selecting the two largest counts
[3, 8, 2, 5]
pointers: i, j, best
code:
for (let i = 0; i < 2; i++) {
  let best = i;
  for (let j = i + 1; j < a.length; j++) {
    if (a[j] > a[best]) best = j;
  }
  swap(a, i, best);
  done(i);
}
```

For $K = \min(N, U)$ selections, the count comparisons take $O(KU)$ time and constant extra working space. A whole-record swap has an additional cost if records embed long character arrays.

“Output in arbitrary order” means you may print the selected records in any order. It does not remove the requirement to select by frequency.

**Practice:** create records manually, before connecting file input. Test equal counts, a single distinct word, repeated mixed-case spellings, and N larger than the available number of records.

```quiz
title: Check: searching and top N

? Counts for three distinct words are 9, 7, and 7. With top N equal to 2, what must the result contain?
- [ ] Only the word with count 9
- [x] The word with count 9 and one of the tied words, under an exact-two tie policy
- [ ] Any two words regardless of count
explain: Top N selects records by rank. The stated tie policy determines which equally ranked word is chosen at the boundary.

? During record sorting, what must move together?
- [x] A word and its frequency
- [ ] Only the frequency
- [ ] Only the word's first character
explain: A count describes its own word. Separating them corrupts the data.
```

## 11. Output with printf, fwrite, and stream checks

### Text versus explicitly sized bytes

For a valid C string:

```cpp
std::printf("%s\n", word);
```

For a known byte sequence:

```cpp
std::size_t written = std::fwrite(data, 1, length, stdout);
```

`fwrite` takes source, item size, item count, and stream. It returns the number of complete items written. With size one, compare its return value with the requested byte count. It adds neither a newline nor a terminating zero. Reference: [fwrite](https://en.cppreference.com/cpp/io/c/fwrite).

When writing a word as text, normally write its letters and then `\n`; do not write the C string terminator into the output file. Use `%d` for `int` and `%zu` for `std::size_t`. Variadic formatted output depends on the arguments matching their format specifiers.

:::warning
Keep the format string under program control. Write `printf("%s", word)`, not `printf(word)`. Input containing percent sequences must remain data.
:::

### Buffers and errors

`stdout` is for requested program output. `stderr` is for diagnostics. A nonzero return from `main` reports failure.

Some output errors appear when buffered bytes are flushed, not at the original write. Check `std::fflush(stdout)` when completing checked standard output. For an opened output file, check `fclose`: closing flushes the stream and can report a failure. Never access a stream after closing it.

### Complete example: write a short byte sequence

```cpp
#include <cstdio>

int main() {
    const char text[] = "sample\n";
    std::size_t length = sizeof text - 1;

    if (std::fwrite(text, 1, length, stdout) != length) {
        std::fprintf(stderr, "Output failed\n");
        return 1;
    }
    if (std::fflush(stdout) == EOF) {
        std::fprintf(stderr, "Output flush failed\n");
        return 1;
    }
}
```

Do not serialize a pointer-owning vector by writing the bytes of the vector object. Those bytes include addresses, not the array's contents. Dumping raw structs can also include padding and machine-specific representations. These exercises require text output, so write the requested words explicitly.

**Practice:** copy input bytes to stdout, checking reads and writes. Then write one C string per line without emitting its terminating zero.

```quiz
title: Check: output

? What does `fwrite(data, 1, length, stdout)` add automatically?
- [ ] A newline
- [ ] A terminating zero
- [x] Neither a newline nor a terminating zero
explain: The function writes only the requested items from the source memory.

? Which output call safely treats a user-provided word as text data?
- [ ] `std::printf(word);`
- [x] `std::printf("%s", word);`
- [ ] Both are equally safe for arbitrary text
explain: A fixed format string prevents percent sequences in the word from being interpreted as formatting instructions.
```

## 12. Compilation, debugging, and an independent practice plan

### Build small complete programs

With Clang on a system that provides the sanitizer runtimes:

```bash
clang++ -std=c++23 -Wall -Wextra -Wpedantic -g \
  -fsanitize=address,undefined main.cpp -o program
./program
```

Warnings help identify missing returns and suspicious conversions. AddressSanitizer helps find out-of-bounds access, use-after-free, and double deletion. UndefinedBehaviorSanitizer finds selected undefined operations. These tools do not prove correctness and do not detect every uninitialized read.

For the course-provided CMake project:

```bash
cmake -S . -B build
cmake --build build
```

The working directory when you launch the executable still determines the meaning of relative input paths.

### Small tests before integration

| Component | Cases worth checking |
|---|---|
| Vector | Empty construction, first insertion, growth, independent copy, assignment, self-assignment, empty removal |
| C strings | Empty string, exact-limit length, terminator placement, independent copies |
| Arguments | Missing option value, unknown option, paths with spaces, malformed and overflowing numbers |
| Reader | Missing file, empty file, short final read, very small buffer |
| Word parser | Repeated spaces, blank lines, CRLF, word split across reads, no final newline |
| Counting | One distinct word, mixed case, repeated words, tied frequencies, top N beyond the distinct count |
| Interactive input | Invalid guess, oversized line followed by a valid line, exact-limit guess, EOF |
| Game | No eligible dictionary word, immediate win, last-attempt win, all attempts used, repeated letters |
| Output | One result per line, no extra zero bytes, errors separated from requested output |

To test file-output behavior separately from terminal display:

```bash
./program --input input.txt --top 3 > result.txt 2> errors.txt
```

Use the argument form appropriate to the program being tested. Fix a random seed while debugging a reproducible game session.

### Implementation order

1. Practise arrays, references, string length, string comparison, and termination.
2. Implement and check the integer vector independently.
3. Store and copy several word records safely.
4. Print and parse command-line arguments.
5. Count input bytes, then copy those bytes to stdout.
6. Recognize normalized words independently of read-buffer size.
7. Count words in records and select the largest counts using manually supplied data.
8. Connect counting to file input for the frequent-words exercise.
9. Practise bounded console input and random choice independently.
10. Combine those pieces for Wordle, using the exact supplied rules.

Each stage should work before you add the next. During live coding, prefer an implementation you can explain, trace, and check within the time available.

### Header reference

| Header | Useful names |
|---|---|
| `<cstddef>` | `std::size_t` |
| `<cstdio>` | `std::FILE`, `fopen`, `fclose`, `fgetc`, `fgets`, `fread`, `fwrite`, `printf`, `fprintf`, `perror`, `ferror`, `fflush` |
| `<cstring>` | `std::strlen`, `std::strcmp`, `std::memcpy` |
| `<cctype>` | `std::tolower`, `std::isalpha` with valid unsigned-character arguments |
| `<cstdlib>` | `std::strtol`, `std::rand`, `std::srand` |
| `<cerrno>` | `errno`, `ERANGE` |
| `<climits>` | `INT_MAX`, integer range constants |
| `<ctime>` | `std::time` |
| `<stdexcept>` | Exception types such as `std::out_of_range`, if you choose checked operations |

Use `cppreference` to confirm function contracts. The exercise pages specify which references may be used during the assessed session; practise independently before that session.

```quiz
title: Final check: autumn LiveCoding

? An owning vector is copied by copying only its array pointer. What is the main ownership problem?
- [ ] The elements automatically become const
- [x] Two objects can attempt to release the same allocation
- [ ] The capacity automatically becomes zero
explain: Copying an address does not create independent storage. Both destructors can then delete the same allocation.

? A parser receives `hel` and then `lo ` in separate reads. How many words should it recognize? Enter an integer.
= 1
explain: The unfinished word survives the read boundary and becomes hello.

? Which resources require explicit release in a manual implementation?
- [x] An array owned through a pointer returned by new[]
- [x] A stream successfully opened with fopen
- [ ] A local fixed-size character array
- [ ] An argument string borrowed from argv
explain: Owned dynamic arrays and opened streams need matching cleanup. Local arrays have automatic storage duration, and argument strings are borrowed.

? What should happen when an interactive reader encounters EOF?
- [ ] Repeat the same failing read indefinitely
- [ ] Treat EOF as an ordinary letter
- [x] Report end-of-input to the caller so it can terminate appropriately
explain: End-of-input is different from a malformed guess that can be retried.

? A valid C string contains 12 letters. How many bytes contain those letters and its terminator in a single-byte encoding? Enter an integer.
= 13
explain: A C string requires one additional zero character after its text.

? Why should word normalization happen consistently before comparison and counting?
- [ ] It makes pointer-address comparison sufficient
- [x] It lets case variants follow the same equality rule
- [ ] It automatically solves UTF-8 character decoding
explain: Consistent normalization supports case-insensitive text comparison. It does not change pointer equality or provide Unicode decoding.
```
