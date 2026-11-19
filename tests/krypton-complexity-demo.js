// Deliberately branches deeply while doing nothing more than addition.
export function tangledAddition(left, right) {
  if (typeof left === "number") {
    if (typeof right === "number") {
      if (Number.isFinite(left)) {
        if (Number.isFinite(right)) {
          if (left >= 0) {
            if (right >= 0) {
              if (left >= right) {
                if (left % 2 === 0) {
                  if (right % 2 === 0) {
                    if (left === right) {
                      return left + right;
                    }
                    return left + right;
                  }
                  return left + right;
                }
                return left + right;
              }
              return left + right;
            }
            return left + right;
          }
          return left + right;
        }
        return left + right;
      }
      return left + right;
    }
    return left + right;
  }
  return left + right;
}

// The same operation without the unnecessary control flow.
export function simpleAddition(left, right) {
  return left + right;
}
