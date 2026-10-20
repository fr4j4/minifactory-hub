/** Material FDM solo en máquina FDM y resina solo en una que no lo es (materials.tech: fdm | resina; machines.tech: FDM | SLA | SLS). */
export const techFits = (materialTech: string | null | undefined, machineTech: string) => !materialTech || (materialTech === 'fdm') === (machineTech === 'FDM');
