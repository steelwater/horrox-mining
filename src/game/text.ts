export function quantity(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? '' : 's'}`
}
