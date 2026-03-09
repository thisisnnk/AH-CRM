import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

export const COUNTRY_CODES = [
  // ── India first ──────────────────────────────────────────────
  { code: "+91",   country: "India",                        flag: "🇮🇳", digits: 10, format: "##### #####" },
  // ── A ────────────────────────────────────────────────────────
  { code: "+93",   country: "Afghanistan",                  flag: "🇦🇫", digits: 9,  format: "## ### ####" },
  { code: "+355",  country: "Albania",                      flag: "🇦🇱", digits: 9,  format: "## ### ####" },
  { code: "+213",  country: "Algeria",                      flag: "🇩🇿", digits: 9,  format: "### ## ## ##" },
  { code: "+376",  country: "Andorra",                      flag: "🇦🇩", digits: 6,  format: "### ###" },
  { code: "+244",  country: "Angola",                       flag: "🇦🇴", digits: 9,  format: "### ### ###" },
  { code: "+1268", country: "Antigua and Barbuda",          flag: "🇦🇬", digits: 10, format: "(###) ###-####" },
  { code: "+54",   country: "Argentina",                    flag: "🇦🇷", digits: 10, format: "# ## ####-####" },
  { code: "+374",  country: "Armenia",                      flag: "🇦🇲", digits: 8,  format: "## ######" },
  { code: "+61",   country: "Australia",                    flag: "🇦🇺", digits: 9,  format: "### ### ###" },
  { code: "+43",   country: "Austria",                      flag: "🇦🇹", digits: 10, format: "### ### ####" },
  { code: "+994",  country: "Azerbaijan",                   flag: "🇦🇿", digits: 9,  format: "## ### ## ##" },
  // ── B ────────────────────────────────────────────────────────
  { code: "+1242", country: "Bahamas",                      flag: "🇧🇸", digits: 10, format: "(###) ###-####" },
  { code: "+973",  country: "Bahrain",                      flag: "🇧🇭", digits: 8,  format: "#### ####" },
  { code: "+880",  country: "Bangladesh",                   flag: "🇧🇩", digits: 10, format: "####-######" },
  { code: "+1246", country: "Barbados",                     flag: "🇧🇧", digits: 10, format: "(###) ###-####" },
  { code: "+375",  country: "Belarus",                      flag: "🇧🇾", digits: 9,  format: "## ###-##-##" },
  { code: "+32",   country: "Belgium",                      flag: "🇧🇪", digits: 9,  format: "### ## ## ##" },
  { code: "+501",  country: "Belize",                       flag: "🇧🇿", digits: 7,  format: "###-####" },
  { code: "+229",  country: "Benin",                        flag: "🇧🇯", digits: 8,  format: "## ## ## ##" },
  { code: "+975",  country: "Bhutan",                       flag: "🇧🇹", digits: 8,  format: "## ## ####" },
  { code: "+591",  country: "Bolivia",                      flag: "🇧🇴", digits: 8,  format: "#### ####" },
  { code: "+387",  country: "Bosnia and Herzegovina",       flag: "🇧🇦", digits: 8,  format: "## ### ###" },
  { code: "+267",  country: "Botswana",                     flag: "🇧🇼", digits: 8,  format: "## ### ###" },
  { code: "+55",   country: "Brazil",                       flag: "🇧🇷", digits: 11, format: "(##) #####-####" },
  { code: "+673",  country: "Brunei",                       flag: "🇧🇳", digits: 7,  format: "### ####" },
  { code: "+359",  country: "Bulgaria",                     flag: "🇧🇬", digits: 9,  format: "## ### ###" },
  { code: "+226",  country: "Burkina Faso",                 flag: "🇧🇫", digits: 8,  format: "## ## ## ##" },
  { code: "+257",  country: "Burundi",                      flag: "🇧🇮", digits: 8,  format: "## ### ###" },
  // ── C ────────────────────────────────────────────────────────
  { code: "+238",  country: "Cabo Verde",                   flag: "🇨🇻", digits: 7,  format: "### ## ##" },
  { code: "+855",  country: "Cambodia",                     flag: "🇰🇭", digits: 9,  format: "## ### ###" },
  { code: "+237",  country: "Cameroon",                     flag: "🇨🇲", digits: 9,  format: "# ## ## ## ##" },
  { code: "+1",    country: "Canada",                       flag: "🇨🇦", digits: 10, format: "(###) ###-####" },
  { code: "+236",  country: "Central African Republic",     flag: "🇨🇫", digits: 8,  format: "## ## ## ##" },
  { code: "+235",  country: "Chad",                         flag: "🇹🇩", digits: 8,  format: "## ## ## ##" },
  { code: "+56",   country: "Chile",                        flag: "🇨🇱", digits: 9,  format: "# #### ####" },
  { code: "+86",   country: "China",                        flag: "🇨🇳", digits: 11, format: "### #### ####" },
  { code: "+57",   country: "Colombia",                     flag: "🇨🇴", digits: 10, format: "### ### ####" },
  { code: "+269",  country: "Comoros",                      flag: "🇰🇲", digits: 7,  format: "### ## ##" },
  { code: "+243",  country: "Congo (DRC)",                  flag: "🇨🇩", digits: 9,  format: "### ### ###" },
  { code: "+242",  country: "Congo (Republic)",             flag: "🇨🇬", digits: 9,  format: "## ### ####" },
  { code: "+506",  country: "Costa Rica",                   flag: "🇨🇷", digits: 8,  format: "#### ####" },
  { code: "+225",  country: "Côte d'Ivoire",                flag: "🇨🇮", digits: 10, format: "## ## ## ## ##" },
  { code: "+385",  country: "Croatia",                      flag: "🇭🇷", digits: 9,  format: "## ### ####" },
  { code: "+53",   country: "Cuba",                         flag: "🇨🇺", digits: 8,  format: "# ### ####" },
  { code: "+357",  country: "Cyprus",                       flag: "🇨🇾", digits: 8,  format: "## ######" },
  { code: "+420",  country: "Czech Republic",               flag: "🇨🇿", digits: 9,  format: "### ### ###" },
  // ── D ────────────────────────────────────────────────────────
  { code: "+45",   country: "Denmark",                      flag: "🇩🇰", digits: 8,  format: "## ## ## ##" },
  { code: "+253",  country: "Djibouti",                     flag: "🇩🇯", digits: 8,  format: "## ## ## ##" },
  { code: "+1767", country: "Dominica",                     flag: "🇩🇲", digits: 10, format: "(###) ###-####" },
  { code: "+1809", country: "Dominican Republic",           flag: "🇩🇴", digits: 10, format: "(###) ###-####" },
  // ── E ────────────────────────────────────────────────────────
  { code: "+670",  country: "East Timor",                   flag: "🇹🇱", digits: 8,  format: "#### ####" },
  { code: "+593",  country: "Ecuador",                      flag: "🇪🇨", digits: 9,  format: "## ### ####" },
  { code: "+20",   country: "Egypt",                        flag: "🇪🇬", digits: 10, format: "### ### ####" },
  { code: "+503",  country: "El Salvador",                  flag: "🇸🇻", digits: 8,  format: "#### ####" },
  { code: "+240",  country: "Equatorial Guinea",            flag: "🇬🇶", digits: 9,  format: "### ### ###" },
  { code: "+291",  country: "Eritrea",                      flag: "🇪🇷", digits: 7,  format: "# ### ###" },
  { code: "+372",  country: "Estonia",                      flag: "🇪🇪", digits: 8,  format: "#### ####" },
  { code: "+268",  country: "Eswatini",                     flag: "🇸🇿", digits: 8,  format: "#### ####" },
  { code: "+251",  country: "Ethiopia",                     flag: "🇪🇹", digits: 9,  format: "## ### ####" },
  // ── F ────────────────────────────────────────────────────────
  { code: "+679",  country: "Fiji",                         flag: "🇫🇯", digits: 7,  format: "### ####" },
  { code: "+358",  country: "Finland",                      flag: "🇫🇮", digits: 9,  format: "## ### ####" },
  { code: "+33",   country: "France",                       flag: "🇫🇷", digits: 9,  format: "# ## ## ## ##" },
  // ── G ────────────────────────────────────────────────────────
  { code: "+241",  country: "Gabon",                        flag: "🇬🇦", digits: 7,  format: "# ## ## ##" },
  { code: "+220",  country: "Gambia",                       flag: "🇬🇲", digits: 7,  format: "### ####" },
  { code: "+995",  country: "Georgia",                      flag: "🇬🇪", digits: 9,  format: "### ## ## ##" },
  { code: "+49",   country: "Germany",                      flag: "🇩🇪", digits: 10, format: "### #### ####" },
  { code: "+233",  country: "Ghana",                        flag: "🇬🇭", digits: 9,  format: "## ### ####" },
  { code: "+30",   country: "Greece",                       flag: "🇬🇷", digits: 10, format: "### ### ####" },
  { code: "+1473", country: "Grenada",                      flag: "🇬🇩", digits: 10, format: "(###) ###-####" },
  { code: "+502",  country: "Guatemala",                    flag: "🇬🇹", digits: 8,  format: "#### ####" },
  { code: "+224",  country: "Guinea",                       flag: "🇬🇳", digits: 9,  format: "### ## ## ##" },
  { code: "+245",  country: "Guinea-Bissau",                flag: "🇬🇼", digits: 9,  format: "### ### ###" },
  { code: "+592",  country: "Guyana",                       flag: "🇬🇾", digits: 7,  format: "### ####" },
  // ── H ────────────────────────────────────────────────────────
  { code: "+509",  country: "Haiti",                        flag: "🇭🇹", digits: 8,  format: "## ## ####" },
  { code: "+504",  country: "Honduras",                     flag: "🇭🇳", digits: 8,  format: "####-####" },
  { code: "+852",  country: "Hong Kong",                    flag: "🇭🇰", digits: 8,  format: "#### ####" },
  { code: "+36",   country: "Hungary",                      flag: "🇭🇺", digits: 9,  format: "## ### ####" },
  // ── I ────────────────────────────────────────────────────────
  { code: "+354",  country: "Iceland",                      flag: "🇮🇸", digits: 7,  format: "### ####" },
  { code: "+62",   country: "Indonesia",                    flag: "🇮🇩", digits: 10, format: "###-####-####" },
  { code: "+98",   country: "Iran",                         flag: "🇮🇷", digits: 10, format: "### ### ####" },
  { code: "+964",  country: "Iraq",                         flag: "🇮🇶", digits: 10, format: "### ### ####" },
  { code: "+353",  country: "Ireland",                      flag: "🇮🇪", digits: 9,  format: "## ### ####" },
  { code: "+972",  country: "Israel",                       flag: "🇮🇱", digits: 9,  format: "##-###-####" },
  { code: "+39",   country: "Italy",                        flag: "🇮🇹", digits: 10, format: "### ### ####" },
  // ── J ────────────────────────────────────────────────────────
  { code: "+1876", country: "Jamaica",                      flag: "🇯🇲", digits: 10, format: "(###) ###-####" },
  { code: "+81",   country: "Japan",                        flag: "🇯🇵", digits: 10, format: "##-####-####" },
  { code: "+962",  country: "Jordan",                       flag: "🇯🇴", digits: 9,  format: "# #### ####" },
  // ── K ────────────────────────────────────────────────────────
  { code: "+7",    country: "Kazakhstan / Russia",          flag: "🇰🇿", digits: 10, format: "### ###-##-##" },
  { code: "+254",  country: "Kenya",                        flag: "🇰🇪", digits: 9,  format: "### ######" },
  { code: "+686",  country: "Kiribati",                     flag: "🇰🇮", digits: 8,  format: "#### ####" },
  { code: "+850",  country: "Korea, North",                 flag: "🇰🇵", digits: 10, format: "### ### ####" },
  { code: "+82",   country: "Korea, South",                 flag: "🇰🇷", digits: 10, format: "##-####-####" },
  { code: "+383",  country: "Kosovo",                       flag: "🇽🇰", digits: 8,  format: "## ### ###" },
  { code: "+965",  country: "Kuwait",                       flag: "🇰🇼", digits: 8,  format: "### #####" },
  { code: "+996",  country: "Kyrgyzstan",                   flag: "🇰🇬", digits: 9,  format: "### ### ###" },
  // ── L ────────────────────────────────────────────────────────
  { code: "+856",  country: "Laos",                         flag: "🇱🇦", digits: 10, format: "## ## ### ###" },
  { code: "+371",  country: "Latvia",                       flag: "🇱🇻", digits: 8,  format: "#### ####" },
  { code: "+961",  country: "Lebanon",                      flag: "🇱🇧", digits: 8,  format: "## ### ###" },
  { code: "+266",  country: "Lesotho",                      flag: "🇱🇸", digits: 8,  format: "#### ####" },
  { code: "+231",  country: "Liberia",                      flag: "🇱🇷", digits: 9,  format: "## ### ####" },
  { code: "+218",  country: "Libya",                        flag: "🇱🇾", digits: 9,  format: "##-#######" },
  { code: "+423",  country: "Liechtenstein",                flag: "🇱🇮", digits: 7,  format: "### ####" },
  { code: "+370",  country: "Lithuania",                    flag: "🇱🇹", digits: 8,  format: "### #####" },
  { code: "+352",  country: "Luxembourg",                   flag: "🇱🇺", digits: 9,  format: "### ### ###" },
  // ── M ────────────────────────────────────────────────────────
  { code: "+853",  country: "Macau",                        flag: "🇲🇴", digits: 8,  format: "#### ####" },
  { code: "+261",  country: "Madagascar",                   flag: "🇲🇬", digits: 9,  format: "## ## ### ##" },
  { code: "+265",  country: "Malawi",                       flag: "🇲🇼", digits: 9,  format: "### ## ## ##" },
  { code: "+60",   country: "Malaysia",                     flag: "🇲🇾", digits: 9,  format: "##-### ####" },
  { code: "+960",  country: "Maldives",                     flag: "🇲🇻", digits: 7,  format: "### ####" },
  { code: "+223",  country: "Mali",                         flag: "🇲🇱", digits: 8,  format: "## ## ## ##" },
  { code: "+356",  country: "Malta",                        flag: "🇲🇹", digits: 8,  format: "#### ####" },
  { code: "+692",  country: "Marshall Islands",             flag: "🇲🇭", digits: 7,  format: "###-####" },
  { code: "+222",  country: "Mauritania",                   flag: "🇲🇷", digits: 8,  format: "## ## ## ##" },
  { code: "+230",  country: "Mauritius",                    flag: "🇲🇺", digits: 8,  format: "#### ####" },
  { code: "+52",   country: "Mexico",                       flag: "🇲🇽", digits: 10, format: "## #### ####" },
  { code: "+691",  country: "Micronesia",                   flag: "🇫🇲", digits: 7,  format: "### ####" },
  { code: "+373",  country: "Moldova",                      flag: "🇲🇩", digits: 8,  format: "### ## ###" },
  { code: "+377",  country: "Monaco",                       flag: "🇲🇨", digits: 9,  format: "# ## ## ## ##" },
  { code: "+976",  country: "Mongolia",                     flag: "🇲🇳", digits: 8,  format: "#### ####" },
  { code: "+382",  country: "Montenegro",                   flag: "🇲🇪", digits: 8,  format: "## ### ###" },
  { code: "+212",  country: "Morocco",                      flag: "🇲🇦", digits: 9,  format: "###-######" },
  { code: "+258",  country: "Mozambique",                   flag: "🇲🇿", digits: 9,  format: "## ### ####" },
  { code: "+95",   country: "Myanmar",                      flag: "🇲🇲", digits: 9,  format: "# ### ### ###" },
  // ── N ────────────────────────────────────────────────────────
  { code: "+264",  country: "Namibia",                      flag: "🇳🇦", digits: 9,  format: "## ### ####" },
  { code: "+674",  country: "Nauru",                        flag: "🇳🇷", digits: 7,  format: "### ####" },
  { code: "+977",  country: "Nepal",                        flag: "🇳🇵", digits: 10, format: "###-#######" },
  { code: "+31",   country: "Netherlands",                  flag: "🇳🇱", digits: 9,  format: "# #### ####" },
  { code: "+64",   country: "New Zealand",                  flag: "🇳🇿", digits: 9,  format: "## ### ####" },
  { code: "+505",  country: "Nicaragua",                    flag: "🇳🇮", digits: 8,  format: "#### ####" },
  { code: "+227",  country: "Niger",                        flag: "🇳🇪", digits: 8,  format: "## ## ## ##" },
  { code: "+234",  country: "Nigeria",                      flag: "🇳🇬", digits: 10, format: "### ### ####" },
  { code: "+389",  country: "North Macedonia",              flag: "🇲🇰", digits: 8,  format: "## ### ###" },
  { code: "+47",   country: "Norway",                       flag: "🇳🇴", digits: 8,  format: "### ## ###" },
  // ── O ────────────────────────────────────────────────────────
  { code: "+968",  country: "Oman",                         flag: "🇴🇲", digits: 8,  format: "#### ####" },
  // ── P ────────────────────────────────────────────────────────
  { code: "+92",   country: "Pakistan",                     flag: "🇵🇰", digits: 10, format: "###-#######" },
  { code: "+680",  country: "Palau",                        flag: "🇵🇼", digits: 7,  format: "### ####" },
  { code: "+970",  country: "Palestine",                    flag: "🇵🇸", digits: 9,  format: "## ### ####" },
  { code: "+507",  country: "Panama",                       flag: "🇵🇦", digits: 8,  format: "####-####" },
  { code: "+675",  country: "Papua New Guinea",             flag: "🇵🇬", digits: 8,  format: "#### ####" },
  { code: "+595",  country: "Paraguay",                     flag: "🇵🇾", digits: 9,  format: "### ######" },
  { code: "+51",   country: "Peru",                         flag: "🇵🇪", digits: 9,  format: "### ### ###" },
  { code: "+63",   country: "Philippines",                  flag: "🇵🇭", digits: 10, format: "### ### ####" },
  { code: "+48",   country: "Poland",                       flag: "🇵🇱", digits: 9,  format: "### ### ###" },
  { code: "+351",  country: "Portugal",                     flag: "🇵🇹", digits: 9,  format: "### ### ###" },
  // ── Q ────────────────────────────────────────────────────────
  { code: "+974",  country: "Qatar",                        flag: "🇶🇦", digits: 8,  format: "#### ####" },
  // ── R ────────────────────────────────────────────────────────
  { code: "+40",   country: "Romania",                      flag: "🇷🇴", digits: 9,  format: "### ### ###" },
  { code: "+250",  country: "Rwanda",                       flag: "🇷🇼", digits: 9,  format: "### ### ###" },
  // ── S ────────────────────────────────────────────────────────
  { code: "+1869", country: "Saint Kitts and Nevis",        flag: "🇰🇳", digits: 10, format: "(###) ###-####" },
  { code: "+1758", country: "Saint Lucia",                  flag: "🇱🇨", digits: 10, format: "(###) ###-####" },
  { code: "+1784", country: "Saint Vincent & Grenadines",   flag: "🇻🇨", digits: 10, format: "(###) ###-####" },
  { code: "+685",  country: "Samoa",                        flag: "🇼🇸", digits: 7,  format: "## #####" },
  { code: "+378",  country: "San Marino",                   flag: "🇸🇲", digits: 8,  format: "## ## ## ##" },
  { code: "+239",  country: "Sao Tome and Principe",        flag: "🇸🇹", digits: 7,  format: "### ####" },
  { code: "+966",  country: "Saudi Arabia",                 flag: "🇸🇦", digits: 9,  format: "## ### ####" },
  { code: "+221",  country: "Senegal",                      flag: "🇸🇳", digits: 9,  format: "## ### ## ##" },
  { code: "+381",  country: "Serbia",                       flag: "🇷🇸", digits: 9,  format: "## ### ####" },
  { code: "+248",  country: "Seychelles",                   flag: "🇸🇨", digits: 7,  format: "# ### ###" },
  { code: "+232",  country: "Sierra Leone",                 flag: "🇸🇱", digits: 8,  format: "## ######" },
  { code: "+65",   country: "Singapore",                    flag: "🇸🇬", digits: 8,  format: "#### ####" },
  { code: "+421",  country: "Slovakia",                     flag: "🇸🇰", digits: 9,  format: "### ### ###" },
  { code: "+386",  country: "Slovenia",                     flag: "🇸🇮", digits: 8,  format: "## ### ###" },
  { code: "+677",  country: "Solomon Islands",              flag: "🇸🇧", digits: 7,  format: "## #####" },
  { code: "+252",  country: "Somalia",                      flag: "🇸🇴", digits: 9,  format: "## ### ####" },
  { code: "+27",   country: "South Africa",                 flag: "🇿🇦", digits: 9,  format: "## ### ####" },
  { code: "+211",  country: "South Sudan",                  flag: "🇸🇸", digits: 9,  format: "### ### ###" },
  { code: "+34",   country: "Spain",                        flag: "🇪🇸", digits: 9,  format: "### ## ## ##" },
  { code: "+94",   country: "Sri Lanka",                    flag: "🇱🇰", digits: 9,  format: "## ### ####" },
  { code: "+249",  country: "Sudan",                        flag: "🇸🇩", digits: 9,  format: "## ### ####" },
  { code: "+597",  country: "Suriname",                     flag: "🇸🇷", digits: 7,  format: "### ####" },
  { code: "+46",   country: "Sweden",                       flag: "🇸🇪", digits: 9,  format: "##-### ## ##" },
  { code: "+41",   country: "Switzerland",                  flag: "🇨🇭", digits: 9,  format: "## ### ## ##" },
  { code: "+963",  country: "Syria",                        flag: "🇸🇾", digits: 9,  format: "### ### ###" },
  // ── T ────────────────────────────────────────────────────────
  { code: "+886",  country: "Taiwan",                       flag: "🇹🇼", digits: 9,  format: "### ### ###" },
  { code: "+992",  country: "Tajikistan",                   flag: "🇹🇯", digits: 9,  format: "### ## ####" },
  { code: "+255",  country: "Tanzania",                     flag: "🇹🇿", digits: 9,  format: "### ### ###" },
  { code: "+66",   country: "Thailand",                     flag: "🇹🇭", digits: 9,  format: "## ### ####" },
  { code: "+228",  country: "Togo",                         flag: "🇹🇬", digits: 8,  format: "## ## ## ##" },
  { code: "+676",  country: "Tonga",                        flag: "🇹🇴", digits: 7,  format: "### ####" },
  { code: "+1868", country: "Trinidad and Tobago",          flag: "🇹🇹", digits: 10, format: "(###) ###-####" },
  { code: "+216",  country: "Tunisia",                      flag: "🇹🇳", digits: 8,  format: "## ### ###" },
  { code: "+90",   country: "Turkey",                       flag: "🇹🇷", digits: 10, format: "### ### ## ##" },
  { code: "+993",  country: "Turkmenistan",                 flag: "🇹🇲", digits: 8,  format: "## ######" },
  { code: "+688",  country: "Tuvalu",                       flag: "🇹🇻", digits: 6,  format: "## ####" },
  // ── U ────────────────────────────────────────────────────────
  { code: "+256",  country: "Uganda",                       flag: "🇺🇬", digits: 9,  format: "### ######" },
  { code: "+380",  country: "Ukraine",                      flag: "🇺🇦", digits: 9,  format: "## ### ####" },
  { code: "+971",  country: "United Arab Emirates",         flag: "🇦🇪", digits: 9,  format: "## ### ####" },
  { code: "+44",   country: "United Kingdom",               flag: "🇬🇧", digits: 10, format: "#### ######" },
  { code: "+1",    country: "United States",                flag: "🇺🇸", digits: 10, format: "(###) ###-####" },
  { code: "+598",  country: "Uruguay",                      flag: "🇺🇾", digits: 8,  format: "## ### ###" },
  { code: "+998",  country: "Uzbekistan",                   flag: "🇺🇿", digits: 9,  format: "## ### ## ##" },
  // ── V ────────────────────────────────────────────────────────
  { code: "+678",  country: "Vanuatu",                      flag: "🇻🇺", digits: 7,  format: "### ####" },
  { code: "+39",   country: "Vatican City",                 flag: "🇻🇦", digits: 10, format: "### ### ####" },
  { code: "+58",   country: "Venezuela",                    flag: "🇻🇪", digits: 10, format: "###-#######" },
  { code: "+84",   country: "Vietnam",                      flag: "🇻🇳", digits: 9,  format: "## ### ## ##" },
  // ── Y ────────────────────────────────────────────────────────
  { code: "+967",  country: "Yemen",                        flag: "🇾🇪", digits: 9,  format: "### ### ###" },
  // ── Z ────────────────────────────────────────────────────────
  { code: "+260",  country: "Zambia",                       flag: "🇿🇲", digits: 9,  format: "## ### ####" },
  { code: "+263",  country: "Zimbabwe",                     flag: "🇿🇼", digits: 9,  format: "## ### ####" },
];

export function getExpectedDigits(dialCode: string): number | undefined {
  return COUNTRY_CODES.find((c) => c.code === dialCode)?.digits;
}

export function isPhoneValid(dialCode: string, number: string): boolean {
  if (!number) return false;
  const digits = number.replace(/\D/g, "").length;
  const expected = getExpectedDigits(dialCode);
  return expected !== undefined ? digits === expected : digits >= 7;
}

/**
 * Applies a format mask to raw digits.
 * '#' in the mask is a digit placeholder; all other characters are separators
 * that get auto-inserted as the user types.
 */
export function applyPhoneFormat(rawDigits: string, mask: string): string {
  if (!mask) return rawDigits;
  let result = "";
  let digitIndex = 0;
  for (let i = 0; i < mask.length && digitIndex < rawDigits.length; i++) {
    if (mask[i] === "#") {
      result += rawDigits[digitIndex++];
    } else {
      result += mask[i];
    }
  }
  // Trim trailing separators that have no following digit
  return result.replace(/[\s\-()+]+$/, "");
}

interface PhoneInputProps {
  label: string;
  required?: boolean;
  dialCode: string;
  number: string;
  onDialCodeChange: (code: string) => void;
  onNumberChange: (num: string) => void;
}

export function PhoneInput({
  label,
  required,
  dialCode,
  number,
  onDialCodeChange,
  onNumberChange,
}: PhoneInputProps) {
  const [open, setOpen] = useState(false);

  const country = COUNTRY_CODES.find((c) => c.code === dialCode) ?? COUNTRY_CODES[0];
  const expectedDigits = country?.digits;
  const digits = number.replace(/\D/g, "").length;
  const touched = number.length > 0;
  const isInvalid = touched && expectedDigits !== undefined && digits !== expectedDigits;

  const mask = country?.format ?? "";
  const displayValue = mask ? applyPhoneFormat(number.replace(/\D/g, ""), mask) : number;
  const placeholder = mask ? mask.replace(/#/g, "_") : (expectedDigits ? `${expectedDigits} digits` : "Number");
  const maxLen = mask ? mask.length : (expectedDigits ?? 15);

  return (
    <div className="space-y-1">
      <Label>
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      <div className="flex gap-1.5">
        {/* Searchable country-code picker */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-[120px] shrink-0 px-2 justify-between font-normal"
            >
              <span className="flex items-center gap-1 text-sm truncate">
                <span>{country?.flag}</span>
                <span>{dialCode}</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[260px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search country or code..." />
              <CommandList>
                <CommandEmpty>No country found.</CommandEmpty>
                <CommandGroup>
                  {COUNTRY_CODES.map((c, i) => (
                    <CommandItem
                      key={`${c.code}-${c.country}-${i}`}
                      value={`${c.country} ${c.code}`}
                      onSelect={() => {
                        onDialCodeChange(c.code);
                        setOpen(false);
                      }}
                    >
                      <span className="flex items-center gap-2 w-full">
                        <span>{c.flag}</span>
                        <span className="flex-1 truncate">{c.country}</span>
                        <span className="text-muted-foreground text-xs shrink-0">{c.code}</span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Number input — displays formatted value, stores raw digits */}
        <Input
          type="tel"
          value={displayValue}
          onChange={(e) => {
            const raw = e.target.value.replace(/\D/g, "");
            onNumberChange(raw);
          }}
          placeholder={placeholder}
          maxLength={maxLen}
          className={cn("flex-1", isInvalid && "border-destructive focus-visible:ring-destructive")}
        />
      </div>
      {isInvalid && (
        <p className="text-xs text-destructive">
          Not valid — {country?.country} numbers require {expectedDigits} digits
        </p>
      )}
    </div>
  );
}
