function trimNullAndDLE(str) {
    let i = str.length - 1;
    while (i >= 0 && (str[i] === '\0' || str[i] === '\x10')) {
        i--;
    }
    return str.substring(0, i + 1);
}